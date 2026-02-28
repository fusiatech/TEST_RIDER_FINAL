export interface RateLimitConfig {
  interval: number
  limit: number
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

interface SlidingWindowEntry {
  timestamps: number[]
  windowStart: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  interval: 60_000,
  limit: 100,
}

export function rateLimit(config: RateLimitConfig = DEFAULT_CONFIG): {
  check: (identifier: string) => Promise<RateLimitResult>
  reset: (identifier: string) => void
  getStats: () => { totalEntries: number; activeEntries: number }
  cleanup: () => number
} {
  const store = new Map<string, SlidingWindowEntry>()
  let cleanupInterval: ReturnType<typeof setInterval> | null = null

  const startCleanup = () => {
    if (cleanupInterval) return
    cleanupInterval = setInterval(() => {
      const now = Date.now()
      let cleaned = 0
      for (const [key, entry] of store.entries()) {
        const validTimestamps = entry.timestamps.filter(
          (ts) => now - ts < config.interval
        )
        if (validTimestamps.length === 0) {
          store.delete(key)
          cleaned++
        } else {
          entry.timestamps = validTimestamps
        }
      }
      if (store.size === 0 && cleanupInterval) {
        clearInterval(cleanupInterval)
        cleanupInterval = null
      }
    }, config.interval)
    if (cleanupInterval.unref) {
      cleanupInterval.unref()
    }
  }

  const check = async (identifier: string): Promise<RateLimitResult> => {
    const now = Date.now()
    let entry = store.get(identifier)

    if (!entry) {
      entry = {
        timestamps: [],
        windowStart: now,
      }
      store.set(identifier, entry)
      startCleanup()
    }

    entry.timestamps = entry.timestamps.filter(
      (ts) => now - ts < config.interval
    )

    const count = entry.timestamps.length
    const success = count < config.limit

    if (success) {
      entry.timestamps.push(now)
    }

    const remaining = Math.max(0, config.limit - entry.timestamps.length)
    const oldestTimestamp = entry.timestamps[0] ?? now
    const reset = oldestTimestamp + config.interval

    return {
      success,
      limit: config.limit,
      remaining,
      reset,
    }
  }

  const reset = (identifier: string): void => {
    store.delete(identifier)
  }

  const getStats = () => {
    const now = Date.now()
    let activeEntries = 0
    for (const entry of store.values()) {
      const validCount = entry.timestamps.filter(
        (ts) => now - ts < config.interval
      ).length
      if (validCount > 0) {
        activeEntries++
      }
    }
    return {
      totalEntries: store.size,
      activeEntries,
    }
  }

  const cleanup = (): number => {
    const now = Date.now()
    let cleaned = 0
    for (const [key, entry] of store.entries()) {
      const validTimestamps = entry.timestamps.filter(
        (ts) => now - ts < config.interval
      )
      if (validTimestamps.length === 0) {
        store.delete(key)
        cleaned++
      } else {
        entry.timestamps = validTimestamps
      }
    }
    return cleaned
  }

  return { check, reset, getStats, cleanup }
}

const limiters = new Map<string, ReturnType<typeof rateLimit>>()

export function getOrCreateLimiter(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): ReturnType<typeof rateLimit> {
  let limiter = limiters.get(key)
  if (!limiter) {
    limiter = rateLimit(config)
    limiters.set(key, limiter)
  }
  return limiter
}

export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return '127.0.0.1'
}

export interface RateLimitOptions {
  config?: RateLimitConfig
  userId?: string | null
  useUserLimit?: boolean
}

export async function checkRateLimit(
  request: Request,
  configOrOptions?: RateLimitConfig | RateLimitOptions
): Promise<{ success: boolean; headers: Headers; result: RateLimitResult }> {
  let config: RateLimitConfig
  let userId: string | null | undefined
  let useUserLimit = false

  if (configOrOptions && 'config' in configOrOptions) {
    config = configOrOptions.config ?? DEFAULT_CONFIG
    userId = configOrOptions.userId
    useUserLimit = configOrOptions.useUserLimit ?? false
  } else if (configOrOptions && 'interval' in configOrOptions && 'limit' in configOrOptions) {
    config = configOrOptions as RateLimitConfig
  } else {
    config = DEFAULT_CONFIG
  }

  const limiterKey = `${config.interval}-${config.limit}`
  const limiter = getOrCreateLimiter(limiterKey, config)

  const ipIdentifier = getClientIdentifier(request)
  const identifier = useUserLimit && userId ? `user:${userId}` : `ip:${ipIdentifier}`

  const result = await limiter.check(identifier)

  const headers = new Headers()
  headers.set('X-RateLimit-Limit', String(result.limit))
  headers.set('X-RateLimit-Remaining', String(result.remaining))
  headers.set('X-RateLimit-Reset', String(result.reset))

  if (!result.success) {
    headers.set('Retry-After', String(Math.ceil((result.reset - Date.now()) / 1000)))
  }

  return { success: result.success, headers, result }
}

export interface DualRateLimitResult {
  success: boolean
  headers: Headers
  ipResult: RateLimitResult
  userResult?: RateLimitResult
}

export async function checkDualRateLimit(
  request: Request,
  config: RateLimitConfig,
  userId?: string | null
): Promise<DualRateLimitResult> {
  const ipLimiterKey = `ip:${config.interval}-${config.limit}`
  const ipLimiter = getOrCreateLimiter(ipLimiterKey, config)
  const ipIdentifier = `ip:${getClientIdentifier(request)}`
  const ipResult = await ipLimiter.check(ipIdentifier)

  let userResult: RateLimitResult | undefined
  if (userId) {
    const userLimiterKey = `user:${config.interval}-${config.limit}`
    const userLimiter = getOrCreateLimiter(userLimiterKey, config)
    const userIdentifier = `user:${userId}`
    userResult = await userLimiter.check(userIdentifier)
  }

  const success = ipResult.success && (!userResult || userResult.success)
  const effectiveResult = userResult && !userResult.success ? userResult : ipResult

  const headers = new Headers()
  headers.set('X-RateLimit-Limit', String(effectiveResult.limit))
  headers.set('X-RateLimit-Remaining', String(effectiveResult.remaining))
  headers.set('X-RateLimit-Reset', String(effectiveResult.reset))

  if (!success) {
    headers.set('Retry-After', String(Math.ceil((effectiveResult.reset - Date.now()) / 1000)))
  }

  return { success, headers, ipResult, userResult }
}

export const ROUTE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/sessions': { interval: 60_000, limit: 100 },
  '/api/settings': { interval: 60_000, limit: 30 },
  '/api/me/preferences': { interval: 60_000, limit: 60 },
  '/api/projects': { interval: 60_000, limit: 100 },
  '/api/jobs': { interval: 60_000, limit: 60 },
  '/api/admin': { interval: 60_000, limit: 30 },
}

export function getRouteRateLimit(pathname: string): RateLimitConfig {
  if (pathname.startsWith('/api/admin')) {
    return ROUTE_RATE_LIMITS['/api/admin']
  }

  for (const [route, config] of Object.entries(ROUTE_RATE_LIMITS)) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return config
    }
  }

  return DEFAULT_CONFIG
}

export function getRateLimitStats(): {
  limiters: { key: string; stats: { totalEntries: number; activeEntries: number } }[]
} {
  const stats: { key: string; stats: { totalEntries: number; activeEntries: number } }[] = []
  for (const [key, limiter] of limiters.entries()) {
    stats.push({ key, stats: limiter.getStats() })
  }
  return { limiters: stats }
}

export function cleanupAllLimiters(): number {
  let total = 0
  for (const limiter of limiters.values()) {
    total += limiter.cleanup()
  }
  return total
}
