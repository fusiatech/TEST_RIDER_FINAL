import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

interface Labels { [key: string]: string }
interface CounterMetric { name: string; help: string; values: Map<string, { labels: Labels; value: number }> }
interface HistogramMetric {
  name: string
  help: string
  buckets: number[]
  values: Map<string, { labels: Labels; count: number; sum: number; bucketCounts: number[] }>
}

interface TraceContext { traceId: string; spanId: string }

interface AuditEvent {
  timestamp: string
  type: string
  traceId?: string
  spanId?: string
  data: Record<string, unknown>
}

const counterRegistry = new Map<string, CounterMetric>()
const histogramRegistry = new Map<string, HistogramMetric>()
const als = new AsyncLocalStorage<TraceContext>()

const AUDIT_DIR = path.join(process.cwd(), 'artifacts')
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit-events.ndjson')
const TRACE_FILE = path.join(AUDIT_DIR, 'trace-samples.ndjson')
mkdirSync(AUDIT_DIR, { recursive: true })

function labelsKey(labels: Labels): string {
  return Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join(',')
}

function ensureCounter(name: string, help: string): CounterMetric {
  let metric = counterRegistry.get(name)
  if (!metric) {
    metric = { name, help, values: new Map() }
    counterRegistry.set(name, metric)
  }
  return metric
}

function ensureHistogram(name: string, help: string, buckets: number[]): HistogramMetric {
  let metric = histogramRegistry.get(name)
  if (!metric) {
    metric = { name, help, buckets, values: new Map() }
    histogramRegistry.set(name, metric)
  }
  return metric
}

export function incrementCounter(name: string, help: string, labels: Labels = {}, value = 1): void {
  const metric = ensureCounter(name, help)
  const key = labelsKey(labels)
  const existing = metric.values.get(key)
  if (existing) {
    existing.value += value
    return
  }
  metric.values.set(key, { labels, value })
}

export function observeHistogram(
  name: string,
  help: string,
  value: number,
  labels: Labels = {},
  buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
): void {
  const metric = ensureHistogram(name, help, buckets)
  const key = labelsKey(labels)
  let point = metric.values.get(key)
  if (!point) {
    point = { labels, count: 0, sum: 0, bucketCounts: new Array(metric.buckets.length).fill(0) }
    metric.values.set(key, point)
  }
  point.count++
  point.sum += value
  const idx = metric.buckets.findIndex((bucket) => value <= bucket)
  if (idx >= 0) {
    point.bucketCounts[idx]++
  }
}

export function exportAuditEvent(type: string, data: Record<string, unknown>): void {
  const ctx = als.getStore()
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    type,
    ...(ctx ? { traceId: ctx.traceId, spanId: ctx.spanId } : {}),
    data,
  }
  appendFileSync(AUDIT_FILE, `${JSON.stringify(event)}\n`)
}

export async function withSpan<T>(name: string, data: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  const parent = als.getStore()
  const traceId = parent?.traceId ?? randomUUID().replace(/-/g, '')
  const spanId = randomUUID().replace(/-/g, '').slice(0, 16)
  const start = process.hrtime.bigint()
  const ctx: TraceContext = { traceId, spanId }
  exportAuditEvent('span.start', { name, ...data, parentSpanId: parent?.spanId ?? null })
  try {
    const result = await als.run(ctx, fn)
    const durSec = Number(process.hrtime.bigint() - start) / 1_000_000_000
    observeHistogram('swarm_span_duration_seconds', 'Span duration in seconds', durSec, { span_name: name })
    exportAuditEvent('span.end', { name, ...data, durationSec: durSec, status: 'ok' })
    appendFileSync(TRACE_FILE, `${JSON.stringify({ traceId, spanId, name, durationSec: durSec, status: 'ok', at: new Date().toISOString() })}\n`)
    return result
  } catch (error: unknown) {
    const durSec = Number(process.hrtime.bigint() - start) / 1_000_000_000
    incrementCounter('swarm_span_failures_total', 'Failed spans', { span_name: name })
    exportAuditEvent('span.end', {
      name,
      ...data,
      durationSec: durSec,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
    appendFileSync(TRACE_FILE, `${JSON.stringify({ traceId, spanId, name, durationSec: durSec, status: 'error', at: new Date().toISOString() })}\n`)
    throw error
  }
}

export function recordApiMetric(route: string, method: string, status: number, durationSec: number): void {
  observeHistogram('swarm_api_latency_seconds', 'API route latency in seconds', durationSec, { route, method })
  incrementCounter('swarm_api_requests_total', 'Total API requests', { route, method, status: String(status) })
  if (status >= 500) {
    incrementCounter('swarm_api_failures_total', 'API failures', { route, method })
  }
}

export function recordQueueLag(lagMs: number, source: string): void {
  observeHistogram('swarm_queue_lag_seconds', 'Queue lag in seconds', lagMs / 1000, { source })
}

export function recordRetry(provider: string): void {
  incrementCounter('swarm_cli_retries_total', 'CLI retry attempts', { provider })
}

export function getPrometheusMetrics(): string {
  const lines: string[] = []
  for (const metric of counterRegistry.values()) {
    lines.push(`# HELP ${metric.name} ${metric.help}`)
    lines.push(`# TYPE ${metric.name} counter`)
    for (const point of metric.values.values()) {
      const labels = Object.entries(point.labels).map(([k, v]) => `${k}="${v}"`).join(',')
      lines.push(`${metric.name}${labels ? `{${labels}}` : ''} ${point.value}`)
    }
  }
  for (const metric of histogramRegistry.values()) {
    lines.push(`# HELP ${metric.name} ${metric.help}`)
    lines.push(`# TYPE ${metric.name} histogram`)
    for (const point of metric.values.values()) {
      const labels = Object.entries(point.labels).map(([k, v]) => `${k}="${v}"`).join(',')
      let cumulative = 0
      metric.buckets.forEach((bucket, idx) => {
        cumulative += point.bucketCounts[idx]
        lines.push(`${metric.name}_bucket{${labels}${labels ? ',' : ''}le="${bucket}"} ${cumulative}`)
      })
      lines.push(`${metric.name}_bucket{${labels}${labels ? ',' : ''}le="+Inf"} ${point.count}`)
      lines.push(`${metric.name}_sum${labels ? `{${labels}}` : ''} ${point.sum}`)
      lines.push(`${metric.name}_count${labels ? `{${labels}}` : ''} ${point.count}`)
    }
  }
  return `${lines.join('\n')}\n`
}
