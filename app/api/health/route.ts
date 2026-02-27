import { NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { detectInstalledCLIs } from '@/server/cli-detect'
import { getLastPipelineRunTime } from '@/server/orchestrator'
import { getCacheStats } from '@/server/output-cache'

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

export async function GET(): Promise<NextResponse> {
  const mem = process.memoryUsage()
  const clis = await getInstalledCLIs()
  const cacheStats = getCacheStats()

  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    activeJobCount: jobQueue.getActiveJobCount(),
    queueDepth: jobQueue.getQueueDepth(),
    queue: jobQueue.getQueueHealthMetrics(),
    installedCLIs: clis,
    lastPipelineRunTime: getLastPipelineRunTime(),
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
    },
    cacheStats,
  })
}
