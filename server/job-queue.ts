import type { SwarmJob, SwarmResult, AgentStatus as AgentStatusType, EnqueueAttachment } from '@/lib/types'
import { getJobs, saveJob } from '@/server/storage'
import { runSwarmPipeline } from '@/server/orchestrator'
import { runScheduledPipeline } from '@/server/scheduled-pipeline'
import { getSettings } from '@/server/storage'
import { broadcastToAll } from '@/server/ws-server'
import { randomUUID, createHash } from 'node:crypto'

const PIPELINE_STAGES = ['research', 'plan', 'code', 'validate', 'security', 'synthesize'] as const
const PRIORITIES = [3, 2, 1] as const
const WEIGHTED_CYCLE: number[] = [3, 3, 2, 2, 1]
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 1_000

interface RetryPolicy {
  maxRetries: number
  baseDelayMs: number
}

type JobProcessor = (job: SwarmJob, onAgentOutput: (agentId: string, data: string) => void, onAgentStatus: (agentId: string, status: string, exitCode?: number) => void) => Promise<SwarmResult>

export interface QueueHealthMetrics {
  activeWorkers: number
  configuredConcurrency: number
  queueDepth: number
  queueDepthByPriority: Record<number, number>
  lagMs: number
  retryingJobs: number
  retriesScheduled: number
  dlqSize: number
}

export class JobQueue {
  private readonly processor: JobProcessor

  private jobs: Map<string, SwarmJob> = new Map()
  private queueByPriority: Map<number, string[]> = new Map(PRIORITIES.map((p) => [p, []]))
  private activeJobs: Set<string> = new Set()
  private processing = false
  private loaded = false
  private cycleIndex = 0
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private idempotencyIndex: Map<string, string> = new Map()
  private dedupeIndex: Map<string, string> = new Map()
  private retriesScheduled = 0
  private dlq: string[] = []
  private configuredConcurrency = 1

  constructor(processor?: JobProcessor) {
    this.processor = processor ?? this.defaultProcessor.bind(this)
  }

  async init(): Promise<void> {
    await this.ensureLoaded()
    this.kickoffWorkers()
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const persisted = await getJobs()
    for (const job of persisted) {
      const normalized = this.normalizeJob(job)
      this.jobs.set(normalized.id, normalized)
      this.rebuildIndexes(normalized)

      if (normalized.status === 'queued') {
        this.pushToPriorityQueue(normalized.id, normalized.priority ?? 2)
      }
      if (normalized.status === 'running') {
        const reset: SwarmJob = { ...normalized, status: 'queued', startedAt: undefined }
        this.jobs.set(reset.id, reset)
        this.pushToPriorityQueue(reset.id, reset.priority ?? 2, true)
        await saveJob(reset)
      }
      if (normalized.status === 'dead-letter') {
        this.dlq.push(normalized.id)
      }
    }
  }

  private normalizeJob(job: SwarmJob): SwarmJob {
    return {
      ...job,
      priority: this.normalizePriority(job.priority),
      retryCount: job.retryCount ?? 0,
      maxRetries: job.maxRetries ?? DEFAULT_MAX_RETRIES,
    }
  }

  private normalizePriority(priority?: number): number {
    if (!priority) return 2
    if (priority >= 3) return 3
    if (priority <= 1) return 1
    return 2
  }

  private rebuildIndexes(job: SwarmJob): void {
    if (job.idempotencyKey) this.idempotencyIndex.set(job.idempotencyKey, job.id)
    if (job.dedupeHash && (job.status === 'queued' || job.status === 'running')) {
      this.dedupeIndex.set(job.dedupeHash, job.id)
    }
  }

  private clearRuntimeIndexes(job: SwarmJob): void {
    if (job.dedupeHash) this.dedupeIndex.delete(job.dedupeHash)
  }

  findByIdempotencyKey(idempotencyKey: string): SwarmJob | null {
    const id = this.idempotencyIndex.get(idempotencyKey)
    if (!id) return null
    return this.jobs.get(id) ?? null
  }

  findDuplicate(sessionId: string, prompt: string, mode: SwarmJob['mode'], attachments?: EnqueueAttachment[]): SwarmJob | null {
    const hash = this.computeDedupeHash(sessionId, prompt, mode, attachments)
    const id = this.dedupeIndex.get(hash)
    if (!id) return null
    const job = this.jobs.get(id)
    if (!job) return null
    if (job.status === 'queued' || job.status === 'running') {
      return job
    }
    return null
  }

  computeDedupeHash(sessionId: string, prompt: string, mode: SwarmJob['mode'], attachments?: EnqueueAttachment[]): string {
    const material = JSON.stringify({ sessionId, prompt, mode, attachments: attachments ?? [] })
    return createHash('sha256').update(material).digest('hex')
  }

  enqueue(params: {
    id?: string
    sessionId: string
    prompt: string
    mode: 'chat' | 'swarm' | 'project'
    attachments?: EnqueueAttachment[]
    source?: 'scheduler' | 'user'
    priority?: number
    maxRetries?: number
    idempotencyKey?: string
    dedupeHash?: string
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
      priority: this.normalizePriority(params.priority),
      retryCount: 0,
      maxRetries: params.maxRetries ?? DEFAULT_MAX_RETRIES,
      idempotencyKey: params.idempotencyKey,
      dedupeHash: params.dedupeHash ?? this.computeDedupeHash(params.sessionId, params.prompt, params.mode, params.attachments),
      ...(params.attachments && params.attachments.length > 0 ? { attachments: params.attachments } : {}),
    }

    this.jobs.set(job.id, job)
    this.rebuildIndexes(job)
    this.pushToPriorityQueue(job.id, job.priority ?? 2)
    void saveJob(job)
    broadcastToAll({ type: 'job-status', job })
    this.kickoffWorkers()
    return job
  }

  private pushToPriorityQueue(jobId: string, priority: number, front = false): void {
    const lane = this.queueByPriority.get(priority) ?? []
    if (front) {
      lane.unshift(jobId)
    } else {
      lane.push(jobId)
    }
    this.queueByPriority.set(priority, lane)
  }

  private dequeueWeighted(now = Date.now()): SwarmJob | null {
    for (let i = 0; i < WEIGHTED_CYCLE.length; i++) {
      const priority = WEIGHTED_CYCLE[this.cycleIndex]
      this.cycleIndex = (this.cycleIndex + 1) % WEIGHTED_CYCLE.length
      const lane = this.queueByPriority.get(priority)
      if (!lane || lane.length === 0) continue

      const id = lane.shift()
      if (!id) continue
      const job = this.jobs.get(id)
      if (!job) continue
      if (job.status === 'cancelled' || job.status === 'dead-letter') continue
      if (job.nextRetryAt && job.nextRetryAt > now) {
        lane.push(id)
        continue
      }
      return job
    }
    return null
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

    for (const priority of PRIORITIES) {
      const lane = this.queueByPriority.get(priority) ?? []
      this.queueByPriority.set(priority, lane.filter((qid) => qid !== id))
    }

    const timer = this.retryTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.retryTimers.delete(id)
    }

    const updated: SwarmJob = { ...job, status: 'cancelled', completedAt: Date.now() }
    this.jobs.set(id, updated)
    this.clearRuntimeIndexes(updated)
    await saveJob(updated)
    broadcastToAll({ type: 'job-status', job: updated })
  }

  updateJob(id: string, update: Partial<SwarmJob>): void {
    const job = this.jobs.get(id)
    if (!job) return
    const updated: SwarmJob = { ...job, ...update, id: job.id }
    this.jobs.set(id, updated)
    if (updated.status !== 'queued' && updated.status !== 'running') {
      this.clearRuntimeIndexes(updated)
    }
    void saveJob(updated)
    broadcastToAll({ type: 'job-status', job: updated })
  }

  private async getConcurrency(): Promise<number> {
    const settings = await getSettings()
    return Math.max(1, Math.min(8, settings.maxConcurrentJobs ?? 1))
  }

  private kickoffWorkers(): void {
    if (this.processing) return
    this.processing = true
    void this.pumpWorkers()
  }

  private async pumpWorkers(): Promise<void> {
    try {
      await this.ensureLoaded()
      while (true) {
        const concurrency = await this.getConcurrency()
        this.configuredConcurrency = concurrency
        if (this.activeJobs.size >= concurrency) break

        const next = this.dequeueWeighted()
        if (!next) break
        this.activeJobs.add(next.id)
        void this.runOne(next).finally(() => {
          this.activeJobs.delete(next.id)
          this.kickoffWorkers()
        })
      }
    } finally {
      this.processing = false
    }
  }


  private async defaultProcessor(
    job: SwarmJob,
    onAgentOutput: (agentId: string, data: string) => void,
    onAgentStatus: (agentId: string, status: string, exitCode?: number) => void
  ): Promise<SwarmResult> {
    const settings = await getSettings()
    const pipelineOpts = {
      prompt: job.prompt,
      settings,
      projectPath: settings.projectPath ?? process.cwd(),
      mode: job.mode,
      onAgentOutput,
      onAgentStatus,
    }
    return job.source === 'scheduler'
      ? runScheduledPipeline(pipelineOpts)
      : runSwarmPipeline(pipelineOpts)
  }

  private async runOne(job: SwarmJob): Promise<void> {
    this.updateJob(job.id, {
      status: 'running',
      startedAt: Date.now(),
      currentStage: 'research',
      progress: Math.max(job.progress, 0),
      nextRetryAt: undefined,
    })

    try {
      const result = await this.processor(
        job,
        (agentId: string, data: string) => {
          broadcastToAll({ type: 'agent-output', agentId, data })
          this.updateStageProgress(job.id, agentId)
        },
        (agentId: string, status: string, exitCode?: number) => {
          broadcastToAll({
            type: 'agent-status',
            agentId,
            status: status as AgentStatusType,
            exitCode,
          })
          this.updateStageProgress(job.id, agentId)
        }
      )

      this.updateJob(job.id, {
        status: 'completed',
        result,
        completedAt: Date.now(),
        progress: 100,
        currentStage: 'done',
      })
      broadcastToAll({ type: 'swarm-result', result })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      await this.handleFailure(job.id, message)
      broadcastToAll({ type: 'swarm-error', error: message })
    }
  }

  private async handleFailure(jobId: string, message: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    const retryPolicy: RetryPolicy = {
      maxRetries: job.maxRetries ?? DEFAULT_MAX_RETRIES,
      baseDelayMs: DEFAULT_RETRY_DELAY_MS,
    }
    const retryCount = job.retryCount ?? 0

    if (retryCount < retryPolicy.maxRetries) {
      const delayMs = retryPolicy.baseDelayMs * Math.pow(2, retryCount)
      const nextRetryAt = Date.now() + delayMs
      const updated: SwarmJob = {
        ...job,
        status: 'queued',
        error: message,
        retryCount: retryCount + 1,
        nextRetryAt,
      }
      this.jobs.set(job.id, updated)
      void saveJob(updated)
      broadcastToAll({ type: 'job-status', job: updated })
      this.retriesScheduled += 1

      const timer = setTimeout(() => {
        this.retryTimers.delete(job.id)
        const latest = this.jobs.get(job.id)
        if (!latest || latest.status !== 'queued') return
        this.pushToPriorityQueue(job.id, latest.priority ?? 2)
        this.kickoffWorkers()
      }, delayMs)
      this.retryTimers.set(job.id, timer)
      return
    }

    const deadLetterJob: SwarmJob = {
      ...job,
      status: 'dead-letter',
      error: message,
      completedAt: Date.now(),
    }
    this.jobs.set(job.id, deadLetterJob)
    this.clearRuntimeIndexes(deadLetterJob)
    this.dlq.push(job.id)
    await saveJob(deadLetterJob)
    broadcastToAll({ type: 'job-status', job: deadLetterJob })
  }

  getActiveJobCount(): number {
    return this.activeJobs.size
  }

  getQueueDepth(): number {
    return PRIORITIES.reduce((sum, p) => sum + (this.queueByPriority.get(p)?.length ?? 0), 0)
  }

  getQueueHealthMetrics(): QueueHealthMetrics {
    const now = Date.now()
    const queuedJobs = Array.from(this.jobs.values()).filter((job) => job.status === 'queued')
    const oldest = queuedJobs.reduce<number | null>((acc, job) => {
      if (acc == null) return job.createdAt
      return Math.min(acc, job.createdAt)
    }, null)

    return {
      activeWorkers: this.activeJobs.size,
      configuredConcurrency: this.configuredConcurrency,
      queueDepth: this.getQueueDepth(),
      queueDepthByPriority: {
        1: this.queueByPriority.get(1)?.length ?? 0,
        2: this.queueByPriority.get(2)?.length ?? 0,
        3: this.queueByPriority.get(3)?.length ?? 0,
      },
      lagMs: oldest == null ? 0 : now - oldest,
      retryingJobs: queuedJobs.filter((job) => (job.retryCount ?? 0) > 0).length,
      retriesScheduled: this.retriesScheduled,
      dlqSize: this.dlq.length,
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
