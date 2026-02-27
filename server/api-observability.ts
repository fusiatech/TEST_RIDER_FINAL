import { NextRequest, NextResponse } from 'next/server'
import { recordApiMetric, withSpan, exportAuditEvent } from '@/server/observability'

export async function withApiMetrics(
  route: string,
  method: string,
  request: NextRequest | null,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const start = process.hrtime.bigint()
  return withSpan(`api.${method.toLowerCase()}.${route.replaceAll('/', '_')}`, { route, method }, async () => {
    try {
      const response = await handler()
      const durationSec = Number(process.hrtime.bigint() - start) / 1_000_000_000
      recordApiMetric(route, method, response.status, durationSec)
      exportAuditEvent('api.request', {
        route,
        method,
        status: response.status,
        durationSec,
        path: request?.nextUrl.pathname,
      })
      return response
    } catch (error: unknown) {
      const durationSec = Number(process.hrtime.bigint() - start) / 1_000_000_000
      recordApiMetric(route, method, 500, durationSec)
      exportAuditEvent('api.request', {
        route,
        method,
        status: 500,
        durationSec,
        error: error instanceof Error ? error.message : String(error),
        path: request?.nextUrl.pathname,
      })
      throw error
    }
  })
}
