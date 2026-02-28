export interface HealthViewData {
  status: string
  version: string
  uptime: number
  activeJobCount: number
  queueDepth: number
  installedCLIs: { id: string; installed: boolean }[]
  lastPipelineRunTime: number | null
  memoryUsage: {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
  }
  systemMemory?: {
    usagePercent: number
    freeMemMB: number
    totalMemMB: number
  }
  cacheStats?: {
    hits: number
    misses: number
    size: number
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function normalizeHealthData(raw: unknown): HealthViewData | null {
  const root = asRecord(raw)
  if (!root) return null

  const details = asRecord(root.details) ?? root
  const memoryRaw = asRecord(details.memoryUsage) ?? asRecord(root.memoryUsage) ?? {}
  const systemMemoryRaw = asRecord(details.systemMemory) ?? asRecord(root.systemMemory)
  const cacheRaw = asRecord(details.cacheStats) ?? asRecord(root.cacheStats)
  const installedRaw = Array.isArray(details.installedCLIs) ? details.installedCLIs : []

  const heapTotal = Math.max(1, asNumber(memoryRaw.heapTotal, 1))
  const heapUsed = Math.max(0, asNumber(memoryRaw.heapUsed, 0))

  return {
    status: asString(root.status, 'degraded'),
    version: asString(root.version, 'unknown'),
    uptime: asNumber(root.uptime, 0),
    activeJobCount: asNumber(details.activeJobCount, 0),
    queueDepth: asNumber(details.queueDepth, 0),
    installedCLIs: installedRaw
      .map((cli) => {
        const parsed = asRecord(cli)
        if (!parsed) return null
        return {
          id: asString(parsed.id, 'unknown'),
          installed: asBoolean(parsed.installed, false),
        }
      })
      .filter((cli): cli is { id: string; installed: boolean } => cli !== null),
    lastPipelineRunTime:
      typeof details.lastPipelineRunTime === 'number' ? details.lastPipelineRunTime : null,
    memoryUsage: {
      rss: asNumber(memoryRaw.rss, 0),
      heapTotal,
      heapUsed: Math.min(heapUsed, heapTotal),
      external: asNumber(memoryRaw.external, 0),
    },
    ...(systemMemoryRaw
      ? {
          systemMemory: {
            usagePercent: asNumber(systemMemoryRaw.usagePercent, 0),
            freeMemMB: asNumber(systemMemoryRaw.freeMemMB, 0),
            totalMemMB: Math.max(0, asNumber(systemMemoryRaw.totalMemMB, 0)),
          },
        }
      : {}),
    ...(cacheRaw
      ? {
          cacheStats: {
            hits: asNumber(cacheRaw.hits, 0),
            misses: asNumber(cacheRaw.misses, 0),
            size: asNumber(cacheRaw.size, 0),
          },
        }
      : {}),
  }
}
