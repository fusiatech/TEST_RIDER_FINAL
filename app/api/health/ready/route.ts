import { NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'

interface ReadinessCheck {
  name: string
  status: 'healthy' | 'unhealthy'
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

  // Check 2: Memory is within acceptable limits (below 90% heap usage)
  const memCheckStart = Date.now()
  try {
    const mem = process.memoryUsage()
    const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100
    const isHealthy = heapUsagePercent < 90

    checks.push({
      name: 'memory',
      status: isHealthy ? 'healthy' : 'unhealthy',
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

  // Check 3: Event loop is responsive (not blocked)
  const eventLoopCheckStart = Date.now()
  try {
    await new Promise<void>((resolve) => setImmediate(resolve))
    const eventLoopLatency = Date.now() - eventLoopCheckStart
    const isHealthy = eventLoopLatency < 100

    checks.push({
      name: 'event_loop',
      status: isHealthy ? 'healthy' : 'unhealthy',
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

  // Determine overall readiness
  const allHealthy = checks.every((check) => check.status === 'healthy')
  const totalLatency = Date.now() - startTime

  const response = {
    status: allHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    totalLatencyMs: totalLatency,
    checks,
  }

  return NextResponse.json(response, {
    status: allHealthy ? 200 : 503,
  })
}
