import type { SwarmJob, SwarmResult, AgentStatus as AgentStatusType, EnqueueAttachment } from '@/lib/types'
import { getJobs, saveJob, getSettings } from '@/server/storage'
import { runSwarmPipeline } from '@/server/orchestrator'
import { runScheduledPipeline } from '@/server/scheduled-pipeline'
import { broadcastToAll } from '@/server/ws-server'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import {
  createJobNotification,
  createPipelineNotification,
} from '@/lib/notifications'
import { createLogger } from '@/server/logger'

const logger = createLogger('job-queue')

/** T2.2: Aligned with pipeline-engine STAGE_NAMES */
const PIPELINE_STAGES = [
  'research',
  'plan',
  'code',
  'validate',
  'security',
  'synthesize',
] as const

const DEFAULT_MAX_CONCURRENT_JOBS = 2
const MIN_FREE_MEMORY_MB = 512

export class JobQueue {
  private jobs: Map<string, SwarmJob> = new Map()
  private activeJobs: Set<string> = new Set()
  private queue: string[] = []
  private idempotencyIndex: Map<string, string> = new Map()
  private processing = false
  private loaded = false
  private maxConcurrentJobs = DEFAULT_MAX_CONCURRENT_JOBS

  private getIdempotencyLookupKey(sessionId: string, idempotencyKey: string): string {
    return `${sessionId}:${idempotencyKey}`
  }

  private registerIdempotency(job: SwarmJob): void {
    if (!job.idempotencyKey) return
    const key = this.getIdempotencyLookupKey(job.sessionId, job.idempotencyKey)
    this.idempotencyIndex.set(key, job.id)
  }

  private clearIdempotency(job: SwarmJob): void {
    if (!job.idempotencyKey) return
    const key = this.getIdempotencyLookupKey(job.sessionId, job.idempotencyKey)
    this.idempotencyIndex.delete(key)
  }

  private findExistingByIdempotency(sessionId: string, idempotencyKey: string): SwarmJob | undefined {
    const key = this.getIdempotencyLookupKey(sessionId, idempotencyKey)
    const existingId = this.idempotencyIndex.get(key)
    if (!existingId) return undefined
    return this.jobs.get(existingId)
  }

  async init(): Promise<void> {
    await this.ensureLoaded()
    await this.loadMaxConcurrentJobs()
    if (this.queue.length > 0) {
      void this.processQueue()
    }
  }

  private async loadMaxConcurrentJobs(): Promise<void> {
    try {
      const settings = await getSettings()
      this.maxConcurrentJobs = settings.maxConcurrentJobs ?? DEFAULT_MAX_CONCURRENT_JOBS
    } catch (err) {
      logger.warn('Failed to load maxConcurrentJobs from settings, using default', { error: err instanceof Error ? err.message : String(err), default: DEFAULT_MAX_CONCURRENT_JOBS })
      this.maxConcurrentJobs = DEFAULT_MAX_CONCURRENT_JOBS
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const persisted = await getJobs()
    for (const job of persisted) {
      this.jobs.set(job.id, job)
      this.registerIdempotency(job)
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
    this.sortQueueByPriority()
  }

  private sortQueueByPriority(): void {
    this.queue.sort((a, b) => {
      const jobA = this.jobs.get(a)
      const jobB = this.jobs.get(b)
      const priorityA = jobA?.priority ?? 0
      const priorityB = jobB?.priority ?? 0
      if (priorityB !== priorityA) {
        return priorityB - priorityA
      }
      return (jobA?.createdAt ?? 0) - (jobB?.createdAt ?? 0)
    })
  }

  private checkMemoryAvailable(): boolean {
    const freeMem = os.freemem()
    const freeMemMB = freeMem / (1024 * 1024)
    return freeMemMB >= MIN_FREE_MEMORY_MB
  }

  private getMemoryUsagePercent(): number {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    return Math.round(((totalMem - freeMem) / totalMem) * 100)
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
    source?: 'scheduler' | 'user'
    priority?: number
    idempotencyKey?: string
  }): SwarmJob {
    const normalizedIdempotencyKey = params.idempotencyKey?.trim() || undefined
    if (normalizedIdempotencyKey) {
      const existing = this.findExistingByIdempotency(
        params.sessionId,
        normalizedIdempotencyKey,
      )
      if (existing) {
        if (
          existing.status === 'queued' ||
          existing.status === 'running' ||
          existing.status === 'completed'
        ) {
          return existing
        }
        this.clearIdempotency(existing)
      }
    }

    const job: SwarmJob = {
      id: params.id ?? randomUUID(),
      sessionId: params.sessionId,
      prompt: params.prompt,
      mode: params.mode,
      ...(normalizedIdempotencyKey ? { idempotencyKey: normalizedIdempotencyKey } : {}),
      status: 'queued',
      createdAt: Date.now(),
      progress: 0,
      source: params.source ?? 'user',
      priority: params.priority ?? 0,
      ...(params.attachments && params.attachments.length > 0 ? { attachments: params.attachments } : {}),
    }
    this.jobs.set(job.id, job)
    this.registerIdempotency(job)
    this.queue.push(job.id)
    this.sortQueueByPriority()
    void saveJob(job)
    
    const position = this.queue.indexOf(job.id) + 1
    broadcastToAll({ type: 'job-status', job })
    broadcastToAll({ type: 'job-queued', jobId: job.id, position })
    this.broadcastActiveJobsCount()
    
    if (!this.processing) {
      void this.processQueue()
    }
    return job
  }

  private dequeue(): SwarmJob | null {
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

  async cancelJob(id: string): Promise<boolean> {
    await this.ensureLoaded()
    const job = this.jobs.get(id)
    if (!job) return false
    
    if (job.status === 'queued') {
      this.queue = this.queue.filter((qid) => qid !== id)
    }
    
    const updated: SwarmJob = { ...job, status: 'cancelled', completedAt: Date.now() }
    this.jobs.set(id, updated)
    this.clearIdempotency(updated)
    this.activeJobs.delete(id)
    await saveJob(updated)
    broadcastToAll({ type: 'job-status', job: updated })
    this.broadcastActiveJobsCount()
    
    if (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrentJobs) {
      void this.processQueue()
    }
    
    return true
  }

  async cancelAllQueued(): Promise<number> {
    await this.ensureLoaded()
    const queuedIds = [...this.queue]
    let cancelledCount = 0
    
    for (const id of queuedIds) {
      const job = this.jobs.get(id)
      if (job && job.status === 'queued') {
        const updated: SwarmJob = { ...job, status: 'cancelled', completedAt: Date.now() }
        this.jobs.set(id, updated)
        this.clearIdempotency(updated)
        await saveJob(updated)
        broadcastToAll({ type: 'job-status', job: updated })
        cancelledCount++
      }
    }
    
    this.queue = []
    this.broadcastActiveJobsCount()
    return cancelledCount
  }

  updateJob(id: string, update: Partial<SwarmJob>): void {
    const job = this.jobs.get(id)
    if (!job) return
    const updated: SwarmJob = { ...job, ...update, id: job.id }
    this.jobs.set(id, updated)
    if (updated.status === 'failed' || updated.status === 'cancelled') {
      this.clearIdempotency(updated)
    } else {
      this.registerIdempotency(updated)
    }
    void saveJob(updated)
    broadcastToAll({ type: 'job-status', job: updated })
  }

  private broadcastActiveJobsCount(): void {
    broadcastToAll({
      type: 'active-jobs-count',
      count: this.activeJobs.size,
      queueDepth: this.queue.length,
    })
  }

  async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      await this.loadMaxConcurrentJobs()

      while (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrentJobs) {
        if (!this.checkMemoryAvailable()) {
          break
        }

        const job = this.dequeue()
        if (!job) break
        if (job.status === 'cancelled') continue

        this.activeJobs.add(job.id)
        const position = this.activeJobs.size
        
        broadcastToAll({ type: 'job-started', jobId: job.id, position })
        this.broadcastActiveJobsCount()

        const startNotification = createJobNotification('job_started', job.id, job.prompt)
        broadcastToAll({ type: 'notification', notification: startNotification })

        void this.runJob(job)
      }
    } finally {
      this.processing = false
    }
  }

  private async runJob(job: SwarmJob): Promise<void> {
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
        onAgentOutput: (agentId: string, data: string) => {
          broadcastToAll({ type: 'agent-output', agentId, data })
          this.updateStageProgress(job.id, agentId)
        },
        onAgentStatus: (agentId: string, status: string, exitCode?: number) => {
          broadcastToAll({
            type: 'agent-status',
            agentId,
            status: status as AgentStatusType,
            exitCode,
          })
          this.updateStageProgress(job.id, agentId)
        },
        onMCPToolResult: (serverId: string, toolName: string, result: unknown, error?: string) => {
          if (error) {
            broadcastToAll({
              type: 'mcp-tool-error',
              serverId,
              toolName,
              error,
            })
          } else {
            broadcastToAll({
              type: 'mcp-tool-result',
              result: {
                serverId,
                toolName,
                result,
                timestamp: Date.now(),
              },
            })
          }
        },
      }
      
      const result =
        job.source === 'scheduler'
          ? await runScheduledPipeline(pipelineOpts)
          : await runSwarmPipeline(pipelineOpts)

      this.updateJob(job.id, {
        status: 'completed',
        result,
        completedAt: Date.now(),
        progress: 100,
        currentStage: 'done',
      })
      broadcastToAll({ type: 'swarm-result', result })

      const completeNotification = createJobNotification('job_completed', job.id, job.prompt)
      broadcastToAll({ type: 'notification', notification: completeNotification })

      const pipelineNotification = createPipelineNotification('pipeline_completed', result.confidence)
      broadcastToAll({ type: 'notification', notification: pipelineNotification })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.updateJob(job.id, {
        status: 'failed',
        error: message,
        completedAt: Date.now(),
      })
      broadcastToAll({ type: 'swarm-error', error: message })

      const failNotification = createJobNotification('job_failed', job.id, job.prompt, message)
      broadcastToAll({ type: 'notification', notification: failNotification })
    } finally {
      this.activeJobs.delete(job.id)
      this.broadcastActiveJobsCount()
      
      if (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrentJobs) {
        void this.processQueue()
      }
    }
  }

  getActiveJobCount(): number {
    return this.activeJobs.size
  }

  getQueueDepth(): number {
    return this.queue.length
  }

  getActiveJobIds(): string[] {
    return Array.from(this.activeJobs)
  }

  getMemoryStats(): { usagePercent: number; freeMemMB: number; totalMemMB: number } {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    return {
      usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      freeMemMB: Math.round(freeMem / (1024 * 1024)),
      totalMemMB: Math.round(totalMem / (1024 * 1024)),
    }
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
