import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const REQUEST_ID_HEADER = 'x-request-id'
const LOGIN_PATH = '/login'
const REGISTER_PATH = '/register'
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/metrics', '/api/eclipse/health']
const SESSION_COOKIE_NAMES = [
  '__Secure-authjs.session-token',
  'authjs.session-token',
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]

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
        secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      }).catch(() => null)
    : null
  const isAuthed = Boolean(token)

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
