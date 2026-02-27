import { NextRequest, NextResponse } from 'next/server'
import {
  checkDualRateLimit,
  RateLimitConfig,
  getClientIdentifier,
  getRouteRateLimit,
  ROUTE_RATE_LIMITS,
} from './rate-limit'
import { auth } from '@/auth'

type RouteHandler = (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse

export interface RateLimitedRouteOptions {
  config?: RateLimitConfig
  keyGenerator?: (request: NextRequest) => string
  useUserLimit?: boolean
}

const ROUTE_CONFIGS: Record<string, RateLimitConfig> = {
  '/api/sessions': { interval: 60_000, limit: 100 },
  '/api/settings': { interval: 60_000, limit: 30 },
  '/api/projects': { interval: 60_000, limit: 100 },
  '/api/jobs': { interval: 60_000, limit: 60 },
  '/api/admin': { interval: 60_000, limit: 30 },
  '/api/terminal/*/write': { interval: 60_000, limit: 60 },
  '/api/files': { interval: 60_000, limit: 100 },
}

const DEFAULT_CONFIG: RateLimitConfig = {
  interval: 60_000,
  limit: 100,
}

function matchRoute(pathname: string): RateLimitConfig {
  if (pathname.startsWith('/api/admin')) {
    return ROUTE_CONFIGS['/api/admin']
  }

  for (const [pattern, config] of Object.entries(ROUTE_CONFIGS)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '[^/]+') + '(/.*)?$'
      )
      if (regex.test(pathname)) {
        return config
      }
    } else if (pathname === pattern || pathname.startsWith(`${pattern}/`)) {
      return config
    }
  }
  return DEFAULT_CONFIG
}

export function withRateLimit(
  handler: RouteHandler,
  options?: RateLimitedRouteOptions
): RouteHandler {
  return async (request, context) => {
    const pathname = new URL(request.url).pathname
    const config = options?.config ?? matchRoute(pathname)

    let userId: string | null = null
    if (options?.useUserLimit !== false) {
      try {
        const session = await auth()
        userId = session?.user?.id ?? null
      } catch {
        // Auth not available, fall back to IP-only limiting
      }
    }

    const customIdentifier = options?.keyGenerator
      ? options.keyGenerator(request)
      : null

    const requestForRateLimit = customIdentifier
      ? new Request(request.url, {
          headers: new Headers([['x-forwarded-for', customIdentifier]]),
        })
      : request

    const { success, headers, ipResult, userResult } = await checkDualRateLimit(
      requestForRateLimit,
      config,
      userId
    )

    const effectiveResult = userResult && !userResult.success ? userResult : ipResult

    if (!success) {
      return new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((effectiveResult.reset - Date.now()) / 1000)} seconds.`,
          limit: effectiveResult.limit,
          remaining: effectiveResult.remaining,
          reset: effectiveResult.reset,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(headers.entries()),
          },
        }
      )
    }

    const response = await handler(request, context)

    headers.forEach((value, key) => {
      response.headers.set(key, value)
    })

    return response
  }
}

export function createRateLimitedHandler(
  handlers: {
    GET?: RouteHandler
    POST?: RouteHandler
    PUT?: RouteHandler
    DELETE?: RouteHandler
    PATCH?: RouteHandler
  },
  options?: RateLimitedRouteOptions
): {
  GET?: RouteHandler
  POST?: RouteHandler
  PUT?: RouteHandler
  DELETE?: RouteHandler
  PATCH?: RouteHandler
} {
  const wrapped: typeof handlers = {}

  for (const [method, handler] of Object.entries(handlers)) {
    if (handler) {
      wrapped[method as keyof typeof handlers] = withRateLimit(handler, options)
    }
  }

  return wrapped
}

export { ROUTE_CONFIGS, DEFAULT_CONFIG, ROUTE_RATE_LIMITS, getRouteRateLimit }
