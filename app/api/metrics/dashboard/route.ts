import { NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { detectInstalledCLIs } from '@/server/cli-detect'
import { getLastPipelineRunTime } from '@/server/orchestrator'
import { getCacheStats } from '@/server/output-cache'
import { getRateLimitStats } from '@/lib/rate-limit'
import { registry } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

interface MetricValue {
  name: string
  value: number
  labels?: Record<string, string>
}

interface TimeSeriesPoint {
  timestamp: number
  value: number
}

interface DashboardMetrics {
  timestamp: string
  system: {
    uptime: number
    cpuUsage: number
    memoryUsage: {
      heapUsed: number
      heapTotal: number
      rss: number
      external: number
      heapUsagePercent: number
    }
    systemMemory: {
      usagePercent: number
      freeMemMB: number
      totalMemMB: number
    }
    eventLoopLatency: number
  }
  requests: {
    total: number
    ratePerMinute: number
    avgLatencyMs: number
    p50LatencyMs: number
    p95LatencyMs: number
    p99LatencyMs: number
    byStatus: Record<string, number>
    byMethod: Record<string, number>
  }
  errors: {
    total: number
    ratePerMinute: number
    byType: Record<string, number>
    recent: Array<{
      timestamp: number
      type: string
      message: string
      path?: string
    }>
  }
  websocket: {
    activeConnections: number
    messagesPerMinute: number
    avgMessageSize: number
  }
  jobs: {
    active: number
    queued: number
    completed: number
    failed: number
    avgDurationMs: number
    throughputPerHour: number
  }
  agents: {
    installed: Array<{ id: string; installed: boolean; name: string }>
    spawnsTotal: number
    failuresTotal: number
    avgResponseTimeMs: number
    byProvider: Record<string, { spawns: number; failures: number; avgTime: number }>
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
    size: number
    maxSize: number
  }
  rateLimit: {
    totalRequests: number
    throttledRequests: number
    throttleRate: number
    limiters?: Array<{ key: string; stats: { totalEntries: number; activeEntries: number } }>
  }
  pipeline: {
    runsTotal: number
    lastRunTime: number | null
    avgConfidenceScore: number
    byMode: Record<string, { runs: number; avgConfidence: number }>
  }
  timeSeries: {
    requestRate: TimeSeriesPoint[]
    errorRate: TimeSeriesPoint[]
    latency: TimeSeriesPoint[]
    memoryUsage: TimeSeriesPoint[]
    jobThroughput: TimeSeriesPoint[]
  }
}

let cachedCLIs: { id: string; installed: boolean }[] | null = null
let cliCacheTime = 0
const CLI_CACHE_TTL = 60_000

const requestHistory: Array<{ timestamp: number; duration: number; status: number; method: string }> = []
const errorHistory: Array<{ timestamp: number; type: string; message: string; path?: string }> = []
const MAX_HISTORY = 1000

async function getInstalledCLIs(): Promise<{ id: string; installed: boolean }[]> {
  if (cachedCLIs && Date.now() - cliCacheTime < CLI_CACHE_TTL) {
    return cachedCLIs
  }
  const detected = await detectInstalledCLIs()
  cachedCLIs = detected.map((c) => ({ id: c.id, installed: c.installed ?? false }))
  cliCacheTime = Date.now()
  return cachedCLIs
}

async function parsePrometheusMetrics(): Promise<Map<string, MetricValue[]>> {
  const metricsText = await registry.metrics()
  const metrics = new Map<string, MetricValue[]>()
  
  const lines = metricsText.split('\n')
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue
    
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+(.+)$/)
    if (match) {
      const [, name, labelsStr, valueStr] = match
      const value = parseFloat(valueStr)
      if (isNaN(value)) continue
      
      const labels: Record<string, string> = {}
      if (labelsStr) {
        const labelMatches = labelsStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g)
        for (const labelMatch of labelMatches) {
          labels[labelMatch[1]] = labelMatch[2]
        }
      }
      
      if (!metrics.has(name)) {
        metrics.set(name, [])
      }
      metrics.get(name)!.push({ name, value, labels })
    }
  }
  
  return metrics
}

function getMetricValue(metrics: Map<string, MetricValue[]>, name: string, labels?: Record<string, string>): number {
  const values = metrics.get(name) || []
  if (!labels) {
    return values.reduce((sum, v) => sum + v.value, 0)
  }
  
  const filtered = values.filter(v => {
    if (!v.labels) return false
    return Object.entries(labels).every(([k, val]) => v.labels![k] === val)
  })
  
  return filtered.reduce((sum, v) => sum + v.value, 0)
}

function generateTimeSeries(dataPoints: number[], intervalMs: number, count: number): TimeSeriesPoint[] {
  const now = Date.now()
  const points: TimeSeriesPoint[] = []
  
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = now - (i * intervalMs)
    const value = dataPoints[count - 1 - i] ?? 0
    points.push({ timestamp, value })
  }
  
  return points
}

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

export async function GET(): Promise<NextResponse<DashboardMetrics>> {
  const startTime = Date.now()
  
  const [clis, prometheusMetrics] = await Promise.all([
    getInstalledCLIs(),
    parsePrometheusMetrics(),
  ])
  
  const mem = process.memoryUsage()
  const heapUsagePercent = (mem.heapUsed / mem.heapTotal) * 100
  
  const eventLoopStart = Date.now()
  await new Promise<void>((resolve) => setImmediate(resolve))
  const eventLoopLatency = Date.now() - eventLoopStart
  
  const systemMemory = jobQueue.getMemoryStats()
  const cacheStats = getCacheStats()
  const rateLimitStats = getRateLimitStats()
  const lastPipelineRunTime = getLastPipelineRunTime()
  
  const activeJobCount = jobQueue.getActiveJobCount()
  const queueDepth = jobQueue.getQueueDepth()
  
  const httpTotal = getMetricValue(prometheusMetrics, 'http_requests_total')
  const wsConnections = getMetricValue(prometheusMetrics, 'swarm_websocket_connections')
  const agentSpawns = getMetricValue(prometheusMetrics, 'swarm_agent_spawns_total')
  const agentFailures = getMetricValue(prometheusMetrics, 'swarm_agent_failures_total')
  const pipelineRuns = getMetricValue(prometheusMetrics, 'swarm_pipeline_runs_total')
  
  const recentRequests = requestHistory.filter(r => Date.now() - r.timestamp < 60000)
  const recentErrors = errorHistory.filter(e => Date.now() - e.timestamp < 60000)
  
  const latencies = recentRequests.map(r => r.duration)
  const avgLatency = latencies.length > 0 
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
    : 0
  
  const statusCounts: Record<string, number> = {}
  const methodCounts: Record<string, number> = {}
  for (const req of recentRequests) {
    const statusGroup = `${Math.floor(req.status / 100)}xx`
    statusCounts[statusGroup] = (statusCounts[statusGroup] || 0) + 1
    methodCounts[req.method] = (methodCounts[req.method] || 0) + 1
  }
  
  const errorTypes: Record<string, number> = {}
  for (const err of recentErrors) {
    errorTypes[err.type] = (errorTypes[err.type] || 0) + 1
  }
  
  const agentNames: Record<string, string> = {
    cursor: 'Cursor',
    gemini: 'Gemini',
    claude: 'Claude',
    copilot: 'Copilot',
    codex: 'Codex',
    rovo: 'Rovo',
    custom: 'Custom',
  }
  
  const installedAgents = clis.map(cli => ({
    id: cli.id,
    installed: cli.installed,
    name: agentNames[cli.id] || cli.id,
  }))
  
  const now = Date.now()
  const timeSeriesCount = 12
  const intervalMs = 5 * 60 * 1000
  
  const requestRateData = Array(timeSeriesCount).fill(0).map((_, i) => {
    const start = now - ((timeSeriesCount - i) * intervalMs)
    const end = start + intervalMs
    return requestHistory.filter(r => r.timestamp >= start && r.timestamp < end).length
  })
  
  const errorRateData = Array(timeSeriesCount).fill(0).map((_, i) => {
    const start = now - ((timeSeriesCount - i) * intervalMs)
    const end = start + intervalMs
    return errorHistory.filter(e => e.timestamp >= start && e.timestamp < end).length
  })
  
  const latencyData = Array(timeSeriesCount).fill(0).map((_, i) => {
    const start = now - ((timeSeriesCount - i) * intervalMs)
    const end = start + intervalMs
    const periodRequests = requestHistory.filter(r => r.timestamp >= start && r.timestamp < end)
    if (periodRequests.length === 0) return 0
    return periodRequests.reduce((sum, r) => sum + r.duration, 0) / periodRequests.length
  })
  
  const memoryData = Array(timeSeriesCount).fill(heapUsagePercent)
  
  const jobData = Array(timeSeriesCount).fill(activeJobCount + queueDepth)
  
  const metrics: DashboardMetrics = {
    timestamp: new Date().toISOString(),
    system: {
      uptime: process.uptime(),
      cpuUsage: 0,
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
        heapUsagePercent: Math.round(heapUsagePercent * 10) / 10,
      },
      systemMemory: {
        usagePercent: systemMemory.usagePercent,
        freeMemMB: systemMemory.freeMemMB,
        totalMemMB: systemMemory.totalMemMB,
      },
      eventLoopLatency,
    },
    requests: {
      total: httpTotal,
      ratePerMinute: recentRequests.length,
      avgLatencyMs: Math.round(avgLatency),
      p50LatencyMs: Math.round(calculatePercentile(latencies, 50)),
      p95LatencyMs: Math.round(calculatePercentile(latencies, 95)),
      p99LatencyMs: Math.round(calculatePercentile(latencies, 99)),
      byStatus: statusCounts,
      byMethod: methodCounts,
    },
    errors: {
      total: statusCounts['5xx'] || 0,
      ratePerMinute: recentErrors.length,
      byType: errorTypes,
      recent: errorHistory.slice(-10).reverse(),
    },
    websocket: {
      activeConnections: wsConnections,
      messagesPerMinute: 0,
      avgMessageSize: 0,
    },
    jobs: {
      active: activeJobCount,
      queued: queueDepth,
      completed: getMetricValue(prometheusMetrics, 'swarm_pipeline_runs_total', { status: 'completed' }),
      failed: getMetricValue(prometheusMetrics, 'swarm_pipeline_runs_total', { status: 'failed' }),
      avgDurationMs: 0,
      throughputPerHour: 0,
    },
    agents: {
      installed: installedAgents,
      spawnsTotal: agentSpawns,
      failuresTotal: agentFailures,
      avgResponseTimeMs: 0,
      byProvider: {},
    },
    cache: {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: cacheStats.hits + cacheStats.misses > 0 
        ? Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100) 
        : 0,
      size: cacheStats.size,
      maxSize: 100,
    },
    rateLimit: {
      totalRequests: rateLimitStats.limiters.reduce((sum, l) => sum + l.stats.totalEntries, 0),
      throttledRequests: 0,
      throttleRate: 0,
      limiters: rateLimitStats.limiters,
    },
    pipeline: {
      runsTotal: pipelineRuns,
      lastRunTime: lastPipelineRunTime,
      avgConfidenceScore: 0,
      byMode: {},
    },
    timeSeries: {
      requestRate: generateTimeSeries(requestRateData, intervalMs, timeSeriesCount),
      errorRate: generateTimeSeries(errorRateData, intervalMs, timeSeriesCount),
      latency: generateTimeSeries(latencyData, intervalMs, timeSeriesCount),
      memoryUsage: generateTimeSeries(memoryData, intervalMs, timeSeriesCount),
      jobThroughput: generateTimeSeries(jobData, intervalMs, timeSeriesCount),
    },
  }
  
  requestHistory.push({
    timestamp: Date.now(),
    duration: Date.now() - startTime,
    status: 200,
    method: 'GET',
  })
  
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory.splice(0, requestHistory.length - MAX_HISTORY)
  }
  
  return NextResponse.json(metrics)
}

export function recordRequest(method: string, status: number, durationMs: number): void {
  requestHistory.push({
    timestamp: Date.now(),
    duration: durationMs,
    status,
    method,
  })
  
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory.splice(0, requestHistory.length - MAX_HISTORY)
  }
}

export function recordError(type: string, message: string, path?: string): void {
  errorHistory.push({
    timestamp: Date.now(),
    type,
    message,
    path,
  })
  
  if (errorHistory.length > MAX_HISTORY) {
    errorHistory.splice(0, errorHistory.length - MAX_HISTORY)
  }
}
