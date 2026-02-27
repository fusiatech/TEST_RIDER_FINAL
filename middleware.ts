import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { REQUEST_ID_HEADER, generateRequestId } from '@/lib/request-logger'

export async function middleware(request: NextRequest) {
  const startTime = Date.now()
  const requestId = request.headers.get(REQUEST_ID_HEADER) || generateRequestId()
  const url = new URL(request.url)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  let userId: string | undefined
  let userEmail: string | undefined

  try {
    const session = await auth()
    userId = session?.user?.id
    userEmail = session?.user?.email
  } catch {
    // Auth not available in middleware context
  }

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
    userId,
    userEmail,
    userAgent: request.headers.get('user-agent') || undefined,
    ip: getClientIp(request),
    referer: request.headers.get('referer') || undefined,
  }

  if (process.env.NODE_ENV === 'development' || process.env.LOG_REQUESTS === 'true') {
    console.log(JSON.stringify({ level: 'info', component: 'middleware', message: 'Request', data: logData }))
  }

  return response
}

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
