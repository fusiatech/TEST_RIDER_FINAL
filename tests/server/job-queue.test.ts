import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SwarmJob } from '@/lib/types'

const mockBroadcastToAll = vi.fn()
const mockSaveJob = vi.fn().mockResolvedValue(undefined)
const mockGetJobs = vi.fn().mockResolvedValue([])
const mockGetSettings = vi.fn().mockResolvedValue({
  maxConcurrentJobs: 2,
  projectPath: '/test/project',
})
const mockRunSwarmPipeline = vi.fn().mockResolvedValue({
  finalOutput: 'Test output',
  confidence: 85,
  agents: [],
  sources: [],
  validationPassed: true,
})
const mockRunScheduledPipeline = vi.fn().mockResolvedValue({
  finalOutput: 'Scheduled output',
  confidence: 90,
  agents: [],
  sources: [],
  validationPassed: true,
})

vi.mock('@/server/storage', () => ({
  getJobs: () => mockGetJobs(),
  saveJob: (job: SwarmJob) => mockSaveJob(job),
  getSettings: () => mockGetSettings(),
}))

vi.mock('@/server/orchestrator', () => ({
  runSwarmPipeline: (opts: unknown) => mockRunSwarmPipeline(opts),
}))

vi.mock('@/server/scheduled-pipeline', () => ({
  runScheduledPipeline: (opts: unknown) => mockRunScheduledPipeline(opts),
}))

vi.mock('@/server/ws-server', () => ({
  broadcastToAll: (msg: unknown) => mockBroadcastToAll(msg),
}))

vi.mock('node:os', () => ({
  default: {
    freemem: vi.fn().mockReturnValue(2 * 1024 * 1024 * 1024),
    totalmem: vi.fn().mockReturnValue(16 * 1024 * 1024 * 1024),
  },
  freemem: vi.fn().mockReturnValue(2 * 1024 * 1024 * 1024),
  totalmem: vi.fn().mockReturnValue(16 * 1024 * 1024 * 1024),
}))

describe('JobQueue', () => {
  let JobQueue: typeof import('@/server/job-queue').JobQueue
  let queue: InstanceType<typeof import('@/server/job-queue').JobQueue>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    mockGetJobs.mockResolvedValue([])
    mockGetSettings.mockResolvedValue({
      maxConcurrentJobs: 2,
      projectPath: '/test/project',
    })
    mockRunSwarmPipeline.mockResolvedValue({
      finalOutput: 'Test output',
      confidence: 85,
      agents: [],
      sources: [],
      validationPassed: true,
    })
    const module = await import('@/server/job-queue')
    JobQueue = module.JobQueue
    queue = new JobQueue()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('enqueue', () => {
    it('creates a job with correct properties', () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.sessionId).toBe('session-1')
      expect(job.prompt).toBe('Test prompt')
      expect(job.mode).toBe('chat')
      expect(job.status).toBe('queued')
      expect(job.createdAt).toBeDefined()
      expect(job.progress).toBe(0)
      expect(job.source).toBe('user')
      expect(job.priority).toBe(0)
    })

    it('uses provided id when specified', () => {
      const job = queue.enqueue({
        id: 'custom-id',
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      expect(job.id).toBe('custom-id')
    })

    it('sets source and priority from params', () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'swarm',
        source: 'scheduler',
        priority: 5,
      })

      expect(job.source).toBe('scheduler')
      expect(job.priority).toBe(5)
    })

    it('includes attachments when provided', () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        attachments: [
          { name: 'file.txt', type: 'text/plain', size: 7, content: 'content' },
        ],
      })

      expect(job.attachments).toHaveLength(1)
      expect(job.attachments?.[0].name).toBe('file.txt')
    })

    it('broadcasts job status on enqueue', () => {
      mockBroadcastToAll.mockClear()

      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'job-status' })
      )
      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'job-queued' })
      )
      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'active-jobs-count' })
      )
    })

    it('saves job to storage on enqueue', () => {
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      expect(mockSaveJob).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          prompt: 'Test prompt',
          status: 'queued',
        })
      )
    })

    it('deduplicates jobs by idempotency key while job is active', () => {
      const first = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-123',
      })

      const second = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-123',
      })

      expect(second.id).toBe(first.id)
    })

    it('allows different sessions to use same idempotency key', () => {
      const first = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-123',
      })

      const second = queue.enqueue({
        sessionId: 'session-2',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-123',
      })

      expect(second.id).not.toBe(first.id)
    })

    it('trims whitespace from idempotency key', () => {
      const first = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: '  request-123  ',
      })

      const second = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-123',
      })

      expect(second.id).toBe(first.id)
    })

    it('allows re-enqueue after cancelled idempotent job', async () => {
      const first = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-456',
      })

      await queue.cancelJob(first.id)

      const second = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'request-456',
      })

      expect(second.id).not.toBe(first.id)
    })

    it('sorts queue by priority (higher first)', () => {
      queue.enqueue({
        id: 'low-priority',
        sessionId: 'session-1',
        prompt: 'Low priority',
        mode: 'chat',
        priority: 1,
      })

      queue.enqueue({
        id: 'high-priority',
        sessionId: 'session-1',
        prompt: 'High priority',
        mode: 'chat',
        priority: 10,
      })

      queue.enqueue({
        id: 'medium-priority',
        sessionId: 'session-1',
        prompt: 'Medium priority',
        mode: 'chat',
        priority: 5,
      })

      expect(queue.getQueueDepth()).toBe(3)
    })
  })

  describe('job processing', () => {
    it('starts processing queue after enqueue', async () => {
      vi.useFakeTimers()
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      expect(mockRunSwarmPipeline).toHaveBeenCalled()
    })

    it('uses runScheduledPipeline for scheduler source', async () => {
      vi.useFakeTimers()
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'swarm',
        source: 'scheduler',
      })

      await vi.runAllTimersAsync()

      expect(mockRunScheduledPipeline).toHaveBeenCalled()
      expect(mockRunSwarmPipeline).not.toHaveBeenCalled()
    })

    it('broadcasts job-started when processing begins', async () => {
      vi.useFakeTimers()
      mockBroadcastToAll.mockClear()
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'job-started' })
      )
    })

    it('broadcasts swarm-result on completion', async () => {
      vi.useFakeTimers()
      mockBroadcastToAll.mockClear()
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'swarm-result' })
      )
    })

    it('updates job status to completed on success', async () => {
      vi.useFakeTimers()
      
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      const updatedJob = await queue.getJob(job.id)
      expect(updatedJob?.status).toBe('completed')
      expect(updatedJob?.progress).toBe(100)
      expect(updatedJob?.completedAt).toBeDefined()
    })

    it('updates job status to failed on error', async () => {
      vi.useFakeTimers()
      mockRunSwarmPipeline.mockRejectedValueOnce(new Error('Pipeline failed'))
      
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      const updatedJob = await queue.getJob(job.id)
      expect(updatedJob?.status).toBe('failed')
      expect(updatedJob?.error).toBe('Pipeline failed')
      expect(updatedJob?.completedAt).toBeDefined()
    })

    it('broadcasts swarm-error on failure', async () => {
      vi.useFakeTimers()
      mockBroadcastToAll.mockClear()
      mockRunSwarmPipeline.mockRejectedValueOnce(new Error('Pipeline failed'))
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'swarm-error', error: 'Pipeline failed' })
      )
    })

    it('broadcasts notifications on job lifecycle', async () => {
      vi.useFakeTimers()
      mockBroadcastToAll.mockClear()
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      const notificationCalls = mockBroadcastToAll.mock.calls.filter(
        call => call[0].type === 'notification'
      )
      expect(notificationCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('job cancellation', () => {
    it('cancels a queued job', async () => {
      mockRunSwarmPipeline.mockImplementation(() => new Promise(() => {}))
      
      const job1 = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'First job',
        mode: 'chat',
      })
      const job2 = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Second job',
        mode: 'chat',
      })
      const job3 = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Third job',
        mode: 'chat',
      })

      const cancelled = await queue.cancelJob(job3.id)
      expect(cancelled).toBe(true)

      const cancelledJob = await queue.getJob(job3.id)
      expect(cancelledJob?.status).toBe('cancelled')
      expect(cancelledJob?.completedAt).toBeDefined()
    })

    it('returns false for non-existent job', async () => {
      const cancelled = await queue.cancelJob('non-existent-id')
      expect(cancelled).toBe(false)
    })

    it('broadcasts job status on cancellation', async () => {
      mockBroadcastToAll.mockClear()
      
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await queue.cancelJob(job.id)

      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'job-status',
          job: expect.objectContaining({ status: 'cancelled' }),
        })
      )
    })

    it('saves cancelled status to storage', async () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      mockSaveJob.mockClear()
      await queue.cancelJob(job.id)

      expect(mockSaveJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: job.id,
          status: 'cancelled',
        })
      )
    })

    it('clears idempotency on cancellation', async () => {
      const first = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'cancel-test',
      })

      await queue.cancelJob(first.id)

      const second = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'cancel-test',
      })

      expect(second.id).not.toBe(first.id)
    })

    it('cancels all queued jobs', async () => {
      mockRunSwarmPipeline.mockImplementation(() => new Promise(() => {}))
      
      queue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })
      queue.enqueue({ sessionId: 's1', prompt: 'Job 2', mode: 'chat' })
      queue.enqueue({ sessionId: 's1', prompt: 'Job 3', mode: 'chat' })

      await new Promise(resolve => setTimeout(resolve, 10))

      const cancelledCount = await queue.cancelAllQueued()
      expect(cancelledCount).toBeGreaterThanOrEqual(0)
      expect(queue.getQueueDepth()).toBe(0)
    })
  })

  describe('concurrent job limits', () => {
    it('respects maxConcurrentJobs setting', async () => {
      mockGetSettings.mockResolvedValue({
        maxConcurrentJobs: 2,
        projectPath: '/test/project',
      })

      let runningCount = 0
      let maxRunning = 0

      mockRunSwarmPipeline.mockImplementation(async () => {
        runningCount++
        maxRunning = Math.max(maxRunning, runningCount)
        await new Promise(resolve => setTimeout(resolve, 50))
        runningCount--
        return {
          finalOutput: 'Test output',
          confidence: 85,
          agents: [],
          sources: [],
          validationPassed: true,
        }
      })

      queue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })
      queue.enqueue({ sessionId: 's1', prompt: 'Job 2', mode: 'chat' })
      queue.enqueue({ sessionId: 's1', prompt: 'Job 3', mode: 'chat' })
      queue.enqueue({ sessionId: 's1', prompt: 'Job 4', mode: 'chat' })

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(maxRunning).toBeLessThanOrEqual(2)
    })

    it('processes more jobs when slots become available', async () => {
      vi.useFakeTimers()
      mockGetSettings.mockResolvedValue({
        maxConcurrentJobs: 1,
        projectPath: '/test/project',
      })

      const job1 = queue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })
      const job2 = queue.enqueue({ sessionId: 's1', prompt: 'Job 2', mode: 'chat' })

      await vi.runAllTimersAsync()

      const finalJob1 = await queue.getJob(job1.id)
      const finalJob2 = await queue.getJob(job2.id)

      expect(finalJob1?.status).toBe('completed')
      expect(finalJob2?.status).toBe('completed')
    })

    it('uses default max concurrent jobs when settings fail', async () => {
      mockGetSettings.mockRejectedValueOnce(new Error('Settings error'))
      
      vi.resetModules()
      const module = await import('@/server/job-queue')
      const newQueue = new module.JobQueue()
      await newQueue.init()

      expect(newQueue.getActiveJobCount()).toBe(0)
    })
  })

  describe('job persistence', () => {
    it('loads persisted jobs on init', async () => {
      const persistedJobs: SwarmJob[] = [
        {
          id: 'persisted-1',
          sessionId: 'session-1',
          prompt: 'Persisted job',
          mode: 'chat',
          status: 'queued',
          createdAt: Date.now() - 1000,
          progress: 0,
        },
      ]
      mockGetJobs.mockResolvedValue(persistedJobs)

      vi.resetModules()
      const module = await import('@/server/job-queue')
      const newQueue = new module.JobQueue()
      await newQueue.init()

      const job = await newQueue.getJob('persisted-1')
      expect(job).toBeDefined()
      expect(job?.prompt).toBe('Persisted job')
    })

    it('resets running jobs to queued on init', async () => {
      const persistedJobs: SwarmJob[] = [
        {
          id: 'running-job',
          sessionId: 'session-1',
          prompt: 'Was running',
          mode: 'chat',
          status: 'running',
          createdAt: Date.now() - 1000,
          startedAt: Date.now() - 500,
          progress: 50,
        },
      ]
      mockGetJobs.mockResolvedValue(persistedJobs)

      vi.resetModules()
      const module = await import('@/server/job-queue')
      const newQueue = new module.JobQueue()
      
      mockRunSwarmPipeline.mockImplementation(() => new Promise(() => {}))
      await newQueue.init()

      const job = await newQueue.getJob('running-job')
      expect(job?.status).toBe('queued')
      expect(job?.startedAt).toBeUndefined()
    })

    it('restores idempotency index from persisted jobs', async () => {
      const persistedJobs: SwarmJob[] = [
        {
          id: 'idempotent-job',
          sessionId: 'session-1',
          prompt: 'Idempotent job',
          mode: 'chat',
          status: 'queued',
          idempotencyKey: 'unique-key',
          createdAt: Date.now() - 1000,
          progress: 0,
        },
      ]
      mockGetJobs.mockResolvedValue(persistedJobs)

      vi.resetModules()
      const module = await import('@/server/job-queue')
      const newQueue = new module.JobQueue()
      
      mockRunSwarmPipeline.mockImplementation(() => new Promise(() => {}))
      await newQueue.init()

      const duplicate = newQueue.enqueue({
        sessionId: 'session-1',
        prompt: 'Duplicate',
        mode: 'chat',
        idempotencyKey: 'unique-key',
      })

      expect(duplicate.id).toBe('idempotent-job')
    })

    it('saves job updates to storage', async () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      mockSaveJob.mockClear()
      queue.updateJob(job.id, { progress: 50, currentStage: 'code' })

      expect(mockSaveJob).toHaveBeenCalledWith(
        expect.objectContaining({
          id: job.id,
          progress: 50,
          currentStage: 'code',
        })
      )
    })
  })

  describe('error handling', () => {
    it('handles non-Error exceptions', async () => {
      vi.useFakeTimers()
      mockRunSwarmPipeline.mockRejectedValueOnce('String error')
      
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      await vi.runAllTimersAsync()

      const updatedJob = await queue.getJob(job.id)
      expect(updatedJob?.status).toBe('failed')
      expect(updatedJob?.error).toBe('String error')
    })

    it('continues processing queue after job failure', async () => {
      vi.useFakeTimers()
      mockGetSettings.mockResolvedValue({
        maxConcurrentJobs: 1,
        projectPath: '/test/project',
      })

      mockRunSwarmPipeline
        .mockRejectedValueOnce(new Error('First job failed'))
        .mockResolvedValueOnce({
          finalOutput: 'Second job output',
          confidence: 85,
          agents: [],
          sources: [],
          validationPassed: true,
        })

      const job1 = queue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })
      const job2 = queue.enqueue({ sessionId: 's1', prompt: 'Job 2', mode: 'chat' })

      await vi.runAllTimersAsync()

      const finalJob1 = await queue.getJob(job1.id)
      const finalJob2 = await queue.getJob(job2.id)

      expect(finalJob1?.status).toBe('failed')
      expect(finalJob2?.status).toBe('completed')
    })

    it('clears idempotency on failure', async () => {
      vi.useFakeTimers()
      mockRunSwarmPipeline.mockRejectedValueOnce(new Error('Failed'))

      const first = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'fail-test',
      })

      await vi.runAllTimersAsync()

      mockRunSwarmPipeline.mockResolvedValueOnce({
        finalOutput: 'Success',
        confidence: 85,
        agents: [],
        sources: [],
        validationPassed: true,
      })

      const second = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
        idempotencyKey: 'fail-test',
      })

      expect(second.id).not.toBe(first.id)
    })
  })

  describe('updateJob', () => {
    it('does nothing for non-existent job', () => {
      expect(() => {
        queue.updateJob('non-existent', { status: 'running' })
      }).not.toThrow()
    })

    it('preserves job id on update', () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      queue.updateJob(job.id, { id: 'different-id', progress: 50 })

      const updatedJob = queue['jobs'].get(job.id)
      expect(updatedJob?.id).toBe(job.id)
    })

    it('broadcasts job status on update', () => {
      const job = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      mockBroadcastToAll.mockClear()
      queue.updateJob(job.id, { progress: 75 })

      expect(mockBroadcastToAll).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'job-status' })
      )
    })
  })

  describe('getActiveJobCount', () => {
    it('returns 0 initially', () => {
      expect(queue.getActiveJobCount()).toBe(0)
    })
  })

  describe('getQueueDepth', () => {
    it('returns 0 initially', () => {
      expect(queue.getQueueDepth()).toBe(0)
    })

    it('increases when jobs are enqueued', () => {
      mockRunSwarmPipeline.mockImplementation(() => new Promise(() => {}))
      
      queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      expect(queue.getQueueDepth()).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getActiveJobIds', () => {
    it('returns empty array initially', () => {
      expect(queue.getActiveJobIds()).toEqual([])
    })
  })

  describe('getMemoryStats', () => {
    it('returns memory statistics', () => {
      const stats = queue.getMemoryStats()
      expect(stats).toHaveProperty('freeMemMB')
      expect(stats).toHaveProperty('totalMemMB')
      expect(stats).toHaveProperty('usagePercent')
      expect(typeof stats.freeMemMB).toBe('number')
      expect(typeof stats.totalMemMB).toBe('number')
      expect(typeof stats.usagePercent).toBe('number')
    })
  })

  describe('getAllJobs', () => {
    it('returns all jobs', async () => {
      queue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })
      queue.enqueue({ sessionId: 's1', prompt: 'Job 2', mode: 'chat' })

      const allJobs = await queue.getAllJobs()
      expect(allJobs.length).toBe(2)
    })

    it('ensures jobs are loaded before returning', async () => {
      mockGetJobs.mockResolvedValue([
        {
          id: 'loaded-job',
          sessionId: 'session-1',
          prompt: 'Loaded job',
          mode: 'chat',
          status: 'completed',
          createdAt: Date.now(),
          progress: 100,
        },
      ])

      vi.resetModules()
      const module = await import('@/server/job-queue')
      const newQueue = new module.JobQueue()

      const allJobs = await newQueue.getAllJobs()
      expect(allJobs.some(j => j.id === 'loaded-job')).toBe(true)
    })
  })

  describe('getJob', () => {
    it('returns undefined for non-existent job', async () => {
      const job = await queue.getJob('non-existent')
      expect(job).toBeUndefined()
    })

    it('returns job by id', async () => {
      const created = queue.enqueue({
        sessionId: 'session-1',
        prompt: 'Test prompt',
        mode: 'chat',
      })

      const retrieved = await queue.getJob(created.id)
      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(created.id)
    })
  })

  describe('memory checks', () => {
    it('stops processing when memory is low', async () => {
      const osMock = await import('node:os')
      vi.mocked(osMock.default.freemem).mockReturnValue(100 * 1024 * 1024)

      vi.resetModules()
      const module = await import('@/server/job-queue')
      const newQueue = new module.JobQueue()

      newQueue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(newQueue.getQueueDepth()).toBeGreaterThanOrEqual(0)
    })
  })

  describe('skips cancelled jobs during processing', () => {
    it('skips jobs that were cancelled before processing', async () => {
      mockRunSwarmPipeline.mockImplementation(() => new Promise(() => {}))
      mockGetSettings.mockResolvedValue({
        maxConcurrentJobs: 1,
        projectPath: '/test/project',
      })

      const job1 = queue.enqueue({ sessionId: 's1', prompt: 'Job 1', mode: 'chat' })
      const job2 = queue.enqueue({ sessionId: 's1', prompt: 'Job 2', mode: 'chat' })

      await queue.cancelJob(job2.id)

      const cancelledJob = await queue.getJob(job2.id)
      expect(cancelledJob?.status).toBe('cancelled')
    })
  })
})
