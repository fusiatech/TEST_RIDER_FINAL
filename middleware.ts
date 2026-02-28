import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getEffectiveAuthSecret } from '@/lib/auth-env'
import { checkDualRateLimit, type RateLimitConfig } from '@/lib/rate-limit'
import { validateCsrfToken } from '@/lib/csrf'

const REQUEST_ID_HEADER = 'x-request-id'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const LOGIN_PATH = '/login'
const REGISTER_PATH = '/register'
const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/health',
  '/api/metrics',
  '/api/eclipse/health',
  '/api/billing/webhook',
  '/api/integrations/github/webhook',
  '/api/integrations/slack/webhook',
  '/api/integrations/linear/webhook',
  '/api/integrations/github/callback',
  '/api/integrations/slack/callback',
  '/api/integrations/linear/callback',
]
const SESSION_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]

const DEFAULT_API_RATE_LIMIT: RateLimitConfig = { interval: 60_000, limit: 100 }
const AUTH_MUTATION_RATE_LIMIT: RateLimitConfig = { interval: 60_000, limit: 60 }
const WEBHOOK_RATE_LIMIT: RateLimitConfig = { interval: 60_000, limit: 300 }
const AUTH_READ_RATE_LIMIT: RateLimitConfig = { interval: 60_000, limit: 120 }

const WEBHOOK_PREFIXES = [
  '/api/billing/webhook',
  '/api/integrations/github/webhook',
  '/api/integrations/slack/webhook',
  '/api/integrations/linear/webhook',
]

const CALLBACK_PREFIXES = [
  '/api/integrations/github/callback',
  '/api/integrations/slack/callback',
  '/api/integrations/linear/callback',
]

const AUTH_SENSITIVE_PREFIXES = [
  '/api/billing/',
  '/api/integrations/',
  '/api/providers/',
]

const AUTH_SENSITIVE_PATHS = new Set([
  '/api/me/profile',
  '/api/me/integrations',
])

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isPublicRoute(pathname: string): boolean {
  if (pathname === LOGIN_PATH || pathname === REGISTER_PATH) return true
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isWebhookRoute(pathname: string): boolean {
  return WEBHOOK_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isCallbackRoute(pathname: string): boolean {
  return CALLBACK_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isAuthSensitiveApiPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false
  if (AUTH_SENSITIVE_PATHS.has(pathname)) return true
  return AUTH_SENSITIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function getApiRateLimit(pathname: string, method: string): RateLimitConfig {
  if (isWebhookRoute(pathname)) return WEBHOOK_RATE_LIMIT
  if (isAuthSensitiveApiPath(pathname) && SAFE_METHODS.has(method.toUpperCase())) {
    return AUTH_READ_RATE_LIMIT
  }
  if (isAuthSensitiveApiPath(pathname)) return AUTH_MUTATION_RATE_LIMIT
  return DEFAULT_API_RATE_LIMIT
}

function resolveUserId(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null
  const maybeRecord = token as Record<string, unknown>
  const id = maybeRecord.id
  if (typeof id === 'string' && id.length > 0) return id
  const sub = maybeRecord.sub
  if (typeof sub === 'string' && sub.length > 0) return sub
  return null
}

function shouldEnforceCsrf(pathname: string, method: string, isAuthed: boolean): boolean {
  if (!isAuthed) return false
  if (!isAuthSensitiveApiPath(pathname)) return false
  if (SAFE_METHODS.has(method.toUpperCase())) return false
  if (isWebhookRoute(pathname) || isCallbackRoute(pathname)) return false
  return true
}

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((cookieName) => Boolean(request.cookies.get(cookieName)?.value))
}

const requestMiddleware = async (request: NextRequest) => {
  const startTime = Date.now()
  const requestId = request.headers.get(REQUEST_ID_HEADER) || generateRequestId()
  const url = new URL(request.url)
  const pathname = url.pathname

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  response.headers.set(REQUEST_ID_HEADER, requestId)

  const durationMs = Date.now() - startTime

  const logData = {
    timestamp: new Date().toISOString(),
    requestId,
    method: request.method,
    path: normalizePath(url.pathname),
    query: url.search || undefined,
    durationMs,
    userAgent: request.headers.get('user-agent') || undefined,
    ip: getClientIp(request),
    referer: request.headers.get('referer') || undefined,
  }

  if (process.env.NODE_ENV === 'development' || process.env.LOG_REQUESTS === 'true') {
    console.log(JSON.stringify({ level: 'info', component: 'middleware', message: 'Request', data: logData }))
  }

  const isPublic = isPublicRoute(pathname)
  const hasCookie = hasSessionCookie(request)
  const token = hasCookie
    ? await getToken({
        req: request,
        secret: getEffectiveAuthSecret(),
      }).catch(() => null)
    : null
  const isAuthed = Boolean(token)
  const tokenUserId = resolveUserId(token)

  if (pathname.startsWith('/api/')) {
    const { success, headers, ipResult, userResult } = await checkDualRateLimit(
      request,
      getApiRateLimit(pathname, request.method),
      tokenUserId
    )

    headers.forEach((value, key) => {
      response.headers.set(key, value)
    })

    if (!success) {
      const effectiveResult = userResult && !userResult.success ? userResult : ipResult
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${Math.ceil((effectiveResult.reset - Date.now()) / 1000)} seconds.`,
          limit: effectiveResult.limit,
          remaining: effectiveResult.remaining,
          reset: effectiveResult.reset,
        },
        {
          status: 429,
          headers: {
            [REQUEST_ID_HEADER]: requestId,
            ...Object.fromEntries(headers.entries()),
          },
        }
      )
    }

    if (shouldEnforceCsrf(pathname, request.method, isAuthed)) {
      const csrfValidation = validateCsrfToken(request)
      if (!csrfValidation.valid) {
        return NextResponse.json(
          {
            error: 'CSRF Validation Failed',
            code: 'CSRF_VALIDATION_FAILED',
            message: csrfValidation.error ?? 'Invalid CSRF token',
          },
          {
            status: 403,
            headers: {
              [REQUEST_ID_HEADER]: requestId,
              ...Object.fromEntries(headers.entries()),
            },
          }
        )
      }
    }
  }

  if (!isPublic && !isAuthed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } }
      )
    }
    const callbackPath =
      request.nextUrl.pathname === '/'
        ? '/app'
        : request.nextUrl.pathname + request.nextUrl.search
    const redirectUrl = new URL(LOGIN_PATH, request.url)
    redirectUrl.searchParams.set('callbackUrl', callbackPath)
    return NextResponse.redirect(redirectUrl, { headers: { [REQUEST_ID_HEADER]: requestId } })
  }

  return response
}

export default requestMiddleware

function getClientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  return undefined
}

function normalizePath(pathname: string): string {
  return pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[^/]+\.(json|xml|txt)$/i, '/:file')
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
