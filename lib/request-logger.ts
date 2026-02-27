import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createLogger } from '@/server/logger'
import { auth } from '@/auth'

const logger = createLogger('request')

export const REQUEST_ID_HEADER = 'x-request-id'

export interface RequestLogData {
  requestId: string
  method: string
  path: string
  query?: string
  status: number
  durationMs: number
  userId?: string
  userEmail?: string
  userAgent?: string
  ip?: string
  contentLength?: number
  referer?: string
  [key: string]: unknown
}

export function generateRequestId(): string {
  return randomUUID()
}

export function getRequestId(request: NextRequest): string {
  return request.headers.get(REQUEST_ID_HEADER) || generateRequestId()
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

type RouteHandler = (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse

export function withRequestLogging(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const startTime = performance.now()
    const requestId = getRequestId(request)
    const url = new URL(request.url)
    const normalizedPath = normalizePath(url.pathname)

    let userId: string | undefined
    let userEmail: string | undefined

    try {
      const session = await auth()
      userId = session?.user?.id
      userEmail = session?.user?.email
    } catch {
      // Auth not available
    }

    logger.debug('Request started', {
      requestId,
      method: request.method,
      path: normalizedPath,
      query: url.search || undefined,
      userId,
      ip: getClientIp(request),
    })

    let response: NextResponse
    let status: number

    try {
      response = await handler(request, context)
      status = response.status
    } catch (error) {
      status = 500
      const durationMs = Math.round(performance.now() - startTime)

      const logData: RequestLogData = {
        requestId,
        method: request.method,
        path: normalizedPath,
        query: url.search || undefined,
        status,
        durationMs,
        userId,
        userEmail,
        userAgent: request.headers.get('user-agent') || undefined,
        ip: getClientIp(request),
        referer: request.headers.get('referer') || undefined,
      }

      logger.error('Request failed', {
        ...logData,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    }

    const durationMs = Math.round(performance.now() - startTime)

    const logData: RequestLogData = {
      requestId,
      method: request.method,
      path: normalizedPath,
      query: url.search || undefined,
      status,
      durationMs,
      userId,
      userEmail,
      userAgent: request.headers.get('user-agent') || undefined,
      ip: getClientIp(request),
      contentLength: parseInt(response.headers.get('content-length') || '0', 10) || undefined,
      referer: request.headers.get('referer') || undefined,
    }

    if (status >= 500) {
      logger.error('Request completed with server error', logData)
    } else if (status >= 400) {
      logger.warn('Request completed with client error', logData)
    } else {
      logger.info('Request completed', logData)
    }

    response.headers.set(REQUEST_ID_HEADER, requestId)

    return response
  }
}

export function logRequest(data: RequestLogData): void {
  if (data.status >= 500) {
    logger.error('Request', data)
  } else if (data.status >= 400) {
    logger.warn('Request', data)
  } else {
    logger.info('Request', data)
  }
}
