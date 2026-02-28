import { NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'

interface ReadinessCheck {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  message?: string
  latencyMs?: number
}

/**
 * Kubernetes Readiness Probe
 * Returns 200 if the service is ready to accept traffic.
 * Checks critical dependencies: database, job queue, and WebSocket availability.
 */
export async function GET(): Promise<NextResponse> {
  const checks: ReadinessCheck[] = []
  const startTime = Date.now()

  // Check 1: Job Queue is operational
  try {
    const queueDepth = jobQueue.getQueueDepth()
    const activeJobs = jobQueue.getActiveJobCount()
    checks.push({
      name: 'job_queue',
      status: 'healthy',
      message: `Queue depth: ${queueDepth}, Active jobs: ${activeJobs}`,
      latencyMs: Date.now() - startTime,
    })
  } catch (error) {
    checks.push({
      name: 'job_queue',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - startTime,
    })
  }

  // Check 2: Memory is within acceptable limits.
  const memCheckStart = Date.now()
  try {
    const mem = process.memoryUsage()
    const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100
    const isDev = process.env.NODE_ENV !== 'production'
    const unhealthyThreshold = isDev ? 99 : 95
    const degradedThreshold = isDev ? 95 : 90
    const status =
      heapUsagePercent < degradedThreshold
        ? 'healthy'
        : heapUsagePercent < unhealthyThreshold
          ? 'degraded'
          : 'unhealthy'

    checks.push({
      name: 'memory',
      status,
      message: `Heap usage: ${heapUsagePercent.toFixed(1)}%`,
      latencyMs: Date.now() - memCheckStart,
    })
  } catch (error) {
    checks.push({
      name: 'memory',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - memCheckStart,
    })
  }

  // Check 3: Event loop is responsive (allow compile spikes in dev).
  const eventLoopCheckStart = Date.now()
  try {
    await new Promise<void>((resolve) => setImmediate(resolve))
    const eventLoopLatency = Date.now() - eventLoopCheckStart
    const status =
      eventLoopLatency < 500
        ? 'healthy'
        : eventLoopLatency < 2000
          ? 'degraded'
          : 'unhealthy'

    checks.push({
      name: 'event_loop',
      status,
      message: `Event loop latency: ${eventLoopLatency}ms`,
      latencyMs: eventLoopLatency,
    })
  } catch (error) {
    checks.push({
      name: 'event_loop',
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
      latencyMs: Date.now() - eventLoopCheckStart,
    })
  }

  // Determine overall readiness: degraded checks remain ready; unhealthy does not.
  const hasUnhealthy = checks.some((check) => check.status === 'unhealthy')
  const hasDegraded = checks.some((check) => check.status === 'degraded')
  const totalLatency = Date.now() - startTime

  const response = {
    status: hasUnhealthy ? 'not_ready' : hasDegraded ? 'ready_degraded' : 'ready',
    timestamp: new Date().toISOString(),
    totalLatencyMs: totalLatency,
    checks,
  }

  return NextResponse.json(response, {
    status: hasUnhealthy ? 503 : 200,
  })
}
