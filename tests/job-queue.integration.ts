import assert from 'node:assert/strict'
import { JobQueue } from '@/server/job-queue'
import type { SwarmJob, SwarmResult } from '@/lib/types'

const okResult: SwarmResult = {
  finalOutput: 'ok',
  confidence: 80,
  agents: [],
  sources: [],
  validationPassed: true,
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for predicate')
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function run(): Promise<void> {
  let attempts: Record<string, number> = {}
  const queue = new JobQueue(async (job: SwarmJob) => {
    attempts[job.id] = (attempts[job.id] ?? 0) + 1
    if (job.prompt.includes('always-fail')) {
      throw new Error('deterministic failure')
    }
    if (job.prompt.includes('retry-once') && attempts[job.id] === 1) {
      throw new Error('transient')
    }
    await new Promise((r) => setTimeout(r, 10))
    return okResult
  })

  const burstSize = 24
  for (let i = 0; i < burstSize; i++) {
    queue.enqueue({
      sessionId: 's-burst',
      prompt: `burst-${i}`,
      mode: 'swarm',
      priority: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1,
    })
  }

  const retryJob = queue.enqueue({
    sessionId: 's-retry',
    prompt: 'retry-once',
    mode: 'swarm',
    maxRetries: 2,
  })
  const dlqJob = queue.enqueue({
    sessionId: 's-dlq',
    prompt: 'always-fail',
    mode: 'swarm',
    maxRetries: 1,
  })

  const duplicate = queue.findDuplicate('s-burst', 'burst-1', 'swarm', undefined)
  assert.ok(duplicate, 'duplicate suppression lookup should find an in-flight match')

  await waitFor(async () => {
    const retry = await queue.getJob(retryJob.id)
    const dlq = await queue.getJob(dlqJob.id)
    return retry?.status === 'completed' && dlq?.status === 'dead-letter'
  }, 8000)

  const metrics = queue.getQueueHealthMetrics()
  assert.ok(metrics.retriesScheduled >= 1, 'retry metric should increment')
  assert.ok(metrics.dlqSize >= 1, 'dlq should contain failed job')

  const all = await queue.getAllJobs()
  const completed = all.filter((j) => j.status === 'completed').length
  assert.ok(completed >= burstSize, 'burst jobs should complete without starvation')

  console.log(JSON.stringify({
    totalJobs: all.length,
    completed,
    retriesScheduled: metrics.retriesScheduled,
    dlqSize: metrics.dlqSize,
    queueDepthByPriority: metrics.queueDepthByPriority,
    lagMs: metrics.lagMs,
  }, null, 2))
}

void run()
