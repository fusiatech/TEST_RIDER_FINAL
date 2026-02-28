import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { detectInstalledCLIs } from '@/server/cli-detect'
import { getLastPipelineRunTime } from '@/server/orchestrator'
import { getCacheStats } from '@/server/output-cache'
import { getRateLimitStats } from '@/lib/rate-limit'
import { startRequestMetrics, endRequestMetrics, getTraceId } from '@/lib/api-metrics'
import { getDb, getSettings } from '@/server/storage'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

let cachedCLIs: { id: string; installed: boolean }[] | null = null
let cliCacheTime = 0
const CLI_CACHE_TTL = 60_000

async function getInstalledCLIs(): Promise<{ id: string; installed: boolean }[]> {
  if (cachedCLIs && Date.now() - cliCacheTime < CLI_CACHE_TTL) {
    return cachedCLIs
  }
  const detected = await detectInstalledCLIs()
  cachedCLIs = detected.map((c) => ({ id: c.id, installed: c.installed ?? false }))
  cliCacheTime = Date.now()
  return cachedCLIs
}

interface HealthCheck {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  message?: string
  latencyMs?: number
  details?: Record<string, unknown>
}

interface DependencyHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  latencyMs?: number
  message?: string
  lastChecked: string
}

async function checkDatabaseHealth(): Promise<DependencyHealth> {
  const start = Date.now()
  try {
    const db = await getDb()
    const sessionCount = db.data.sessions?.length ?? 0
    const projectCount = db.data.projects?.length ?? 0
    
    return {
      name: 'database',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: `Sessions: ${sessionCount}, Projects: ${projectCount}`,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database check failed',
      lastChecked: new Date().toISOString(),
    }
  }
}

async function checkWebSocketHealth(): Promise<DependencyHealth> {
  const start = Date.now()
  try {
    const activeJobs = jobQueue.getActiveJobCount()
    const queueDepth = jobQueue.getQueueDepth()
    
    return {
      name: 'websocket',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: `Active jobs: ${activeJobs}, Queue: ${queueDepth}`,
      lastChecked: new Date().toISOString(),
    }
  } catch (error) {
    return {
      name: 'websocket',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'WebSocket check failed',
      lastChecked: new Date().toISOString(),
    }
  }
}

async function checkExternalServices(): Promise<DependencyHealth[]> {
  const services: DependencyHealth[] = []
  
  // Check GitHub CLI availability
  try {
    const { execSync } = await import('child_process')
    const start = Date.now()
    execSync('gh --version', { stdio: 'pipe', timeout: 5000 })
    services.push({
      name: 'github_cli',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: 'gh CLI available',
      lastChecked: new Date().toISOString(),
    })
  } catch {
    services.push({
      name: 'github_cli',
      status: 'degraded',
      message: 'gh CLI not available',
      lastChecked: new Date().toISOString(),
    })
  }
  
  // Check Git availability
  try {
    const { execSync } = await import('child_process')
    const start = Date.now()
    execSync('git --version', { stdio: 'pipe', timeout: 5000 })
    services.push({
      name: 'git',
      status: 'healthy',
      latencyMs: Date.now() - start,
      message: 'git available',
      lastChecked: new Date().toISOString(),
    })
  } catch {
    services.push({
      name: 'git',
      status: 'unhealthy',
      message: 'git not available',
      lastChecked: new Date().toISOString(),
    })
  }
  
  return services
}

/**
 * Comprehensive Health Endpoint
 * Provides detailed health information for monitoring and debugging.
 * Use /api/health/live for Kubernetes liveness probes.
 * Use /api/health/ready for Kubernetes readiness probes.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const versionInfo = getApiVersion(request)
  const metrics = startRequestMetrics('GET', '/api/health')
  const startTime = Date.now()
  const checks: HealthCheck[] = []

  // Memory check
  const mem = process.memoryUsage()
  const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100
  checks.push({
    name: 'memory',
    status: heapUsagePercent < 70 ? 'healthy' : heapUsagePercent < 85 ? 'degraded' : 'unhealthy',
    message: `Heap: ${heapUsagePercent.toFixed(1)}% used`,
  })

  // Job queue check
  const queueDepth = jobQueue.getQueueDepth()
  const activeJobs = jobQueue.getActiveJobCount()
  checks.push({
    name: 'job_queue',
    status: queueDepth < 5 ? 'healthy' : queueDepth < 15 ? 'degraded' : 'unhealthy',
    message: `Queue: ${queueDepth}, Active: ${activeJobs}`,
  })

  // Event loop responsiveness
  const eventLoopStart = Date.now()
  await new Promise<void>((resolve) => setImmediate(resolve))
  const eventLoopLatency = Date.now() - eventLoopStart
  checks.push({
    name: 'event_loop',
    status: eventLoopLatency < 50 ? 'healthy' : eventLoopLatency < 200 ? 'degraded' : 'unhealthy',
    message: `Latency: ${eventLoopLatency}ms`,
    latencyMs: eventLoopLatency,
  })

  // CLI availability
  const clis = await getInstalledCLIs()
  const installedCount = clis.filter((c) => c.installed).length
  checks.push({
    name: 'cli_agents',
    status: installedCount > 0 ? 'healthy' : 'degraded',
    message: `${installedCount}/${clis.length} CLIs available`,
  })

  // GAP-069 & GAP-075: Dependency health checks
  const dependencies: DependencyHealth[] = []
  
  // Database health
  const dbHealth = await checkDatabaseHealth()
  dependencies.push(dbHealth)
  checks.push({
    name: 'database',
    status: dbHealth.status === 'unknown' ? 'degraded' : dbHealth.status,
    message: dbHealth.message,
    latencyMs: dbHealth.latencyMs,
  })
  
  // WebSocket health
  const wsHealth = await checkWebSocketHealth()
  dependencies.push(wsHealth)
  checks.push({
    name: 'websocket',
    status: wsHealth.status === 'unknown' ? 'degraded' : wsHealth.status,
    message: wsHealth.message,
    latencyMs: wsHealth.latencyMs,
  })
  
  // External services
  const externalServices = await checkExternalServices()
  dependencies.push(...externalServices)
  for (const service of externalServices) {
    checks.push({
      name: service.name,
      status: service.status === 'unknown' ? 'degraded' : service.status,
      message: service.message,
      latencyMs: service.latencyMs,
    })
  }

  // Determine overall status
  const hasUnhealthy = checks.some((c) => c.status === 'unhealthy')
  const hasDegraded = checks.some((c) => c.status === 'degraded')
  const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy'

  const cacheStats = getCacheStats()
  const rateLimitStats = getRateLimitStats()
  const systemMemory = jobQueue.getMemoryStats()
  const settings = await getSettings()
  const executionRuntime = settings.executionRuntime ?? 'server_managed'
  const providerPriority = settings.providerPriority ?? settings.enabledCLIs
  const apiKeys = settings.apiKeys ?? {}
  const providerReadiness = providerPriority.map((provider) => {
    const installed = clis.find((c) => c.id === provider)?.installed ?? false
    const configured = (() => {
      if (provider === 'cursor' || provider === 'codex') return Boolean(apiKeys.openai || apiKeys.codex)
      if (provider === 'gemini') return Boolean(apiKeys.gemini || apiKeys.google)
      if (provider === 'claude') return Boolean(apiKeys.claude || apiKeys.anthropic)
      if (provider === 'copilot') return Boolean(apiKeys.copilot || apiKeys.github)
      return Boolean(apiKeys.custom)
    })()
    const runtimeAvailable =
      executionRuntime === 'server_managed'
        ? ['cursor', 'codex', 'gemini', 'claude'].includes(provider)
        : installed
    return {
      provider,
      installed,
      configured,
      authValid: null,
      quotaOk: null,
      runtimeAvailable,
      lastFailureCode: null,
    }
  })

  const response = NextResponse.json({
    status: overallStatus,
    version: '1.0.0',
    apiVersion: versionInfo.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startTime,
    checks,
    dependencies,
    details: {
      activeJobCount: activeJobs,
      activeJobIds: jobQueue.getActiveJobIds(),
      queueDepth,
      installedCLIs: clis,
      providerReadiness,
      executionRuntime,
      freeOnlyMode: settings.freeOnlyMode ?? false,
      lastPipelineRunTime: getLastPipelineRunTime(),
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        heapUsagePercent: Math.round(heapUsagePercent * 10) / 10,
      },
      systemMemory: {
        usagePercent: systemMemory.usagePercent,
        freeMemMB: systemMemory.freeMemMB,
        totalMemMB: systemMemory.totalMemMB,
      },
      cacheStats,
      rateLimitStats,
    },
    traceId: getTraceId(),
  })

  endRequestMetrics(metrics, response.status)
  return addVersionHeaders(response, versionInfo)
}
