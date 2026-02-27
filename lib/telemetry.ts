import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions'
import { trace, context, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

let sdk: NodeSDK | null = null
let tracer: Tracer | null = null

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'swarm-ui'
const SERVICE_VERSION = process.env.npm_package_version || '1.0.0'

export function initTelemetry(): void {
  if (sdk) {
    return
  }

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'

  const exporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  })

  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  })

  sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-net': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
      }),
    ],
  })

  sdk.start()
  tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION)

  console.log(`[telemetry] OpenTelemetry initialized for ${SERVICE_NAME}`)
  console.log(`[telemetry] Exporting traces to ${otlpEndpoint}`)
}

export function getTracer(): Tracer {
  if (!tracer) {
    tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION)
  }
  return tracer
}

export interface SpanOptions {
  attributes?: Record<string, string | number | boolean>
  parentSpan?: Span
}

export function createSpan(
  name: string,
  options?: SpanOptions,
): Span {
  const t = getTracer()
  const ctx = options?.parentSpan
    ? trace.setSpan(context.active(), options.parentSpan)
    : context.active()

  const span = t.startSpan(name, { attributes: options?.attributes }, ctx)
  return span
}

export function addSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const currentSpan = trace.getActiveSpan()
  if (currentSpan) {
    currentSpan.addEvent(name, attributes)
  }
}

export function setSpanError(span: Span, error: Error | string): void {
  const message = error instanceof Error ? error.message : error
  span.setStatus({ code: SpanStatusCode.ERROR, message })
  span.recordException(error instanceof Error ? error : new Error(message))
}

export function setSpanSuccess(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK })
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  const span = createSpan(name, options)
  const ctx = trace.setSpan(context.active(), span)

  try {
    const result = await context.with(ctx, () => fn(span))
    setSpanSuccess(span)
    return result
  } catch (error) {
    setSpanError(span, error instanceof Error ? error : String(error))
    throw error
  } finally {
    span.end()
  }
}

export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions,
): T {
  const span = createSpan(name, options)
  const ctx = trace.setSpan(context.active(), span)

  try {
    const result = context.with(ctx, () => fn(span))
    setSpanSuccess(span)
    return result
  } catch (error) {
    setSpanError(span, error instanceof Error ? error : String(error))
    throw error
  } finally {
    span.end()
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = null
    tracer = null
    console.log('[telemetry] OpenTelemetry shutdown complete')
  }
}

/* ── GAP-069 & GAP-075: Trace Context Propagation ─────────────────── */

/**
 * Add trace context headers to outgoing HTTP requests.
 * Use this when making fetch/axios calls to propagate distributed tracing.
 */
export function addTraceContext(headers: Record<string, string>): Record<string, string> {
  const carrier: Record<string, string> = { ...headers }
  const propagator = new W3CTraceContextPropagator()
  propagator.inject(context.active(), carrier, {
    set: (c, key, value) => {
      c[key] = value
    },
  })
  return carrier
}

/**
 * Extract trace context from incoming HTTP request headers.
 * Returns a context that can be used as parent for new spans.
 */
export function extractTraceContext(headers: Record<string, string | string[] | undefined>): ReturnType<typeof context.active> {
  const carrier: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      carrier[key.toLowerCase()] = value
    } else if (Array.isArray(value) && value.length > 0) {
      carrier[key.toLowerCase()] = value[0]
    }
  }
  
  const propagator = new W3CTraceContextPropagator()
  return propagator.extract(context.active(), carrier, {
    get: (c, key) => c[key],
    keys: (c) => Object.keys(c),
  })
}

/**
 * Get the current trace ID from active span.
 */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  return span.spanContext().traceId
}

/**
 * Get the current span ID from active span.
 */
export function getCurrentSpanId(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  return span.spanContext().spanId
}

/**
 * Create a child span from extracted context (for distributed tracing).
 */
export function createSpanFromContext(
  name: string,
  extractedContext: ReturnType<typeof context.active>,
  options?: SpanOptions
): Span {
  const t = getTracer()
  const span = t.startSpan(name, { attributes: options?.attributes }, extractedContext)
  return span
}

/**
 * Wrap a fetch call with trace context propagation.
 */
export async function tracedFetch(
  url: string,
  options?: RequestInit & { spanName?: string }
): Promise<Response> {
  const spanName = options?.spanName ?? `fetch ${new URL(url).pathname}`
  
  return withSpan(spanName, async (span) => {
    span.setAttribute('http.url', url)
    span.setAttribute('http.method', options?.method ?? 'GET')
    
    const headers = addTraceContext({
      ...(options?.headers as Record<string, string> ?? {}),
    })
    
    const response = await fetch(url, {
      ...options,
      headers,
    })
    
    span.setAttribute('http.status_code', response.status)
    
    if (!response.ok) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${response.status}`,
      })
    }
    
    return response
  }, {
    attributes: {
      'http.target': url,
    },
  })
}

/**
 * Add correlation IDs to log entries for log-trace correlation.
 */
export function getLogCorrelationIds(): { traceId?: string; spanId?: string; service: string } {
  return {
    traceId: getCurrentTraceId(),
    spanId: getCurrentSpanId(),
    service: SERVICE_NAME,
  }
}
