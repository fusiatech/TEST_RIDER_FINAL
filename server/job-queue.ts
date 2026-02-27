import type { SwarmJob, SwarmResult, AgentStatus as AgentStatusType, EnqueueAttachment } from '@/lib/types'
import { getEvidence, getJobs, saveJob, updateReplayRun } from '@/server/storage'
import { runSwarmPipeline } from '@/server/orchestrator'
import { runScheduledPipeline } from '@/server/scheduled-pipeline'
import { getSettings } from '@/server/storage'
import { broadcastToAll } from '@/server/ws-server'
import { randomUUID } from 'node:crypto'
import { appendRunEvent, createRunReplay, setRunStatus } from '@/server/replay'

/** T2.2: Aligned with pipeline-engine STAGE_NAMES */
const PIPELINE_STAGES = [
  'research',
  'plan',
  'code',
  'validate',
  'security',
  'synthesize',
] as const

export class JobQueue {
  private jobs: Map<string, SwarmJob> = new Map()
  private running: string | null = null
  private queue: string[] = []
  private processing = false
  private loaded = false

  async init(): Promise<void> {
    await this.ensureLoaded()
    if (this.queue.length > 0) {
      void this.processNext()
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const persisted = await getJobs()
    for (const job of persisted) {
      this.jobs.set(job.id, job)
      if (job.status === 'queued') {
        this.queue.push(job.id)
      }
      if (job.status === 'running') {
        const reset: SwarmJob = { ...job, status: 'queued', startedAt: undefined }
        this.jobs.set(job.id, reset)
        this.queue.unshift(job.id)
        await saveJob(reset)
      }
    }
  }

  enqueue(params: {
    id?: string
    sessionId: string
    prompt: string
    mode: 'chat' | 'swarm' | 'project'
    attachments?: EnqueueAttachment[]
    result?: SwarmResult
    error?: string
    startedAt?: number
    completedAt?: number
    currentStage?: string
    /** T2.1: 'scheduler' = use pipeline-engine; 'user' = use runSwarmPipeline */
    source?: 'scheduler' | 'user'
  }): SwarmJob {
    const job: SwarmJob = {
      id: params.id ?? randomUUID(),
      sessionId: params.sessionId,
      prompt: params.prompt,
      mode: params.mode,
      status: 'queued',
      createdAt: Date.now(),
      progress: 0,
      source: params.source ?? 'user',
      ...(params.attachments && params.attachments.length > 0 ? { attachments: params.attachments } : {}),
    }
    this.jobs.set(job.id, job)
    this.queue.push(job.id)
    void saveJob(job)
    void (async () => {
      const settings = await getSettings()
      await createRunReplay({
        runId: job.id,
        sessionId: job.sessionId,
        prompt: job.prompt,
        mode: job.mode,
        settingsSnapshot: settings,
      })
      await appendRunEvent(job.id, 'job-status', {
        status: job.status,
        progress: job.progress,
      })
    })()
    broadcastToAll({ type: 'job-status', job })
    if (!this.processing) {
      void this.processNext()
    }
    return job
  }

  dequeue(): SwarmJob | null {
    const id = this.queue.shift()
    if (!id) return null
    return this.jobs.get(id) ?? null
  }

  async getJob(id: string): Promise<SwarmJob | undefined> {
    await this.ensureLoaded()
    return this.jobs.get(id)
  }

  async getAllJobs(): Promise<SwarmJob[]> {
    await this.ensureLoaded()
    return Array.from(this.jobs.values())
  }

  async cancelJob(id: string): Promise<void> {
    await this.ensureLoaded()
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === 'queued') {
      this.queue = this.queue.filter((qid) => qid !== id)
    }
    const updated: SwarmJob = { ...job, status: 'cancelled', completedAt: Date.now() }
    this.jobs.set(id, updated)
    await saveJob(updated)
    await setRunStatus(id, updated.status, updated.completedAt)
    await appendRunEvent(id, 'job-status', {
      status: updated.status,
      progress: updated.progress,
      currentStage: updated.currentStage,
    })
    broadcastToAll({ type: 'job-status', job: updated })
  }

  updateJob(id: string, update: Partial<SwarmJob>): void {
    const job = this.jobs.get(id)
    if (!job) return
    const updated: SwarmJob = { ...job, ...update, id: job.id }
    this.jobs.set(id, updated)
    void saveJob(updated)
    void setRunStatus(id, updated.status, updated.completedAt)
    void appendRunEvent(id, 'job-status', {
      status: updated.status,
      progress: updated.progress,
      currentStage: updated.currentStage,
    })
    broadcastToAll({ type: 'job-status', job: updated })
  }

  async processNext(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (this.queue.length > 0) {
        const job = this.dequeue()
        if (!job) break
        if (job.status === 'cancelled') continue

        this.running = job.id
        this.updateJob(job.id, {
          status: 'running',
          startedAt: Date.now(),
          currentStage: 'research',
          progress: 0,
        })

        try {
          const settings = await getSettings()
          const pipelineOpts = {
            prompt: job.prompt,
            settings,
            projectPath: settings.projectPath ?? process.cwd(),
            mode: job.mode,
            evidenceId: undefined,
            onAgentOutput: (agentId: string, data: string) => {
              broadcastToAll({ type: 'agent-output', agentId, data })
              void appendRunEvent(job.id, 'agent-output', {
                agentId,
                data: data.slice(0, 4000),
              })
              this.updateStageProgress(job.id, agentId)
            },
            onAgentStatus: (agentId: string, status: string, exitCode?: number) => {
              broadcastToAll({
                type: 'agent-status',
                agentId,
                status: status as AgentStatusType,
                exitCode,
              })
              void appendRunEvent(job.id, 'agent-status', {
                agentId,
                status,
                exitCode,
              })
              this.updateStageProgress(job.id, agentId)
            },
          }
          const result =
            job.source === 'scheduler'
              ? await runScheduledPipeline(pipelineOpts)
              : await runSwarmPipeline(pipelineOpts)

          const evidenceId = pipelineOpts.evidenceId
          if (evidenceId) {
            await updateReplayRun(job.id, { evidenceId })
          }
          const evidence = evidenceId ? await getEvidence(evidenceId) : undefined

          const completedAt = Date.now()
          this.updateJob(job.id, {
            status: 'completed',
            result,
            completedAt,
            progress: 100,
            currentStage: 'done',
          })
          await appendRunEvent(job.id, 'check', {
            validationPassed: result.validationPassed,
            confidence: result.confidence,
            sourceCount: result.sources.length,
          })
          await appendRunEvent(job.id, 'run-completed', {
            resultSummary: {
              confidence: result.confidence,
              validationPassed: result.validationPassed,
            },
            evidence,
          })
          await setRunStatus(job.id, 'completed', completedAt)
          broadcastToAll({ type: 'swarm-result', result })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          const completedAt = Date.now()
          this.updateJob(job.id, {
            status: 'failed',
            error: message,
            completedAt,
          })
          await appendRunEvent(job.id, 'run-failed', {
            error: message,
          })
          await setRunStatus(job.id, 'failed', completedAt)
          broadcastToAll({ type: 'swarm-error', error: message })
        }

        this.running = null
      }
    } finally {
      this.processing = false
    }
  }

  getActiveJobCount(): number {
    return this.running !== null ? 1 : 0
  }

  getQueueDepth(): number {
    return this.queue.length
  }

  private updateStageProgress(jobId: string, agentId: string): void {
    const lower = agentId.toLowerCase()
    let stageIndex = -1
    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
      if (lower.includes(PIPELINE_STAGES[i])) {
        stageIndex = i
        break
      }
    }
    if (stageIndex === -1) return
    const progress = Math.min(95, Math.round(((stageIndex + 1) / PIPELINE_STAGES.length) * 100))
    const job = this.jobs.get(jobId)
    if (job && progress > job.progress) {
      const updated: SwarmJob = {
        ...job,
        progress,
        currentStage: PIPELINE_STAGES[stageIndex],
      }
      this.jobs.set(jobId, updated)
      void saveJob(updated)
    }
  }
}

export const jobQueue = new JobQueue()
