import { trace } from '@opentelemetry/api'
import { httpRequestsTotal, httpRequestDuration } from '@/lib/metrics'

export interface RequestMetrics {
  method: string
  path: string
  startTime: number
}

export function startRequestMetrics(method: string, path: string): RequestMetrics {
  return {
    method,
    path: normalizePath(path),
    startTime: performance.now(),
  }
}

export function endRequestMetrics(metrics: RequestMetrics, status: number): void {
  const duration = (performance.now() - metrics.startTime) / 1000

  try {
    httpRequestsTotal.inc({
      method: metrics.method,
      path: metrics.path,
      status: String(status),
    })
    httpRequestDuration.observe(
      { method: metrics.method, path: metrics.path },
      duration
    )
  } catch {
    // Silently ignore metric recording errors
  }
}

export function getTraceId(): string | undefined {
  const activeSpan = trace.getActiveSpan()
  return activeSpan?.spanContext().traceId
}

export function getSpanId(): string | undefined {
  const activeSpan = trace.getActiveSpan()
  return activeSpan?.spanContext().spanId
}

function normalizePath(pathname: string): string {
  return pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[^/]+\.(json|xml|txt)$/i, '/:file')
}

export function withMetrics<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T,
  path: string
): T {
  return (async (...args: unknown[]) => {
    const request = args[0] as Request
    const metrics = startRequestMetrics(request.method, path)

    try {
      const response = await handler(...args)
      endRequestMetrics(metrics, response.status)
      return response
    } catch (error) {
      endRequestMetrics(metrics, 500)
      throw error
    }
  }) as T
}
