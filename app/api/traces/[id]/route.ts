import { NextRequest, NextResponse } from 'next/server'

interface TempoSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  serviceName: string
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes?: Array<{
    key: string
    value: { stringValue?: string; intValue?: string; boolValue?: boolean }
  }>
  status?: {
    code: number
    message?: string
  }
}

interface TempoTrace {
  batches: Array<{
    resource: {
      attributes: Array<{
        key: string
        value: { stringValue?: string }
      }>
    }
    scopeSpans: Array<{
      spans: TempoSpan[]
    }>
  }>
}

interface ProcessedSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  operationName: string
  serviceName: string
  duration: number
  startTime: number
  tags: Array<{ key: string; value: string }>
  status: 'ok' | 'error' | 'unset'
  children: ProcessedSpan[]
}

interface TraceResponse {
  traceId: string
  rootSpan: ProcessedSpan
  spanCount: number
  duration: number
  services: string[]
}

function getServiceName(batch: TempoTrace['batches'][0]): string {
  const serviceAttr = batch.resource.attributes?.find(
    (attr) => attr.key === 'service.name'
  )
  return serviceAttr?.value?.stringValue || 'unknown'
}

function processSpan(span: TempoSpan, serviceName: string): ProcessedSpan {
  const startNano = BigInt(span.startTimeUnixNano)
  const endNano = BigInt(span.endTimeUnixNano)
  const durationMicros = Number((endNano - startNano) / BigInt(1000))

  const tags: Array<{ key: string; value: string }> = []
  if (span.attributes) {
    for (const attr of span.attributes) {
      const value =
        attr.value.stringValue ||
        attr.value.intValue?.toString() ||
        (attr.value.boolValue !== undefined ? String(attr.value.boolValue) : '')
      tags.push({ key: attr.key, value })
    }
  }

  let status: 'ok' | 'error' | 'unset' = 'unset'
  if (span.status) {
    if (span.status.code === 2) {
      status = 'error'
    } else if (span.status.code === 1) {
      status = 'ok'
    }
  }

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    operationName: span.operationName,
    serviceName,
    duration: durationMicros,
    startTime: Number(startNano / BigInt(1000000)),
    tags,
    status,
    children: [],
  }
}

function buildSpanTree(spans: ProcessedSpan[]): ProcessedSpan | null {
  if (spans.length === 0) return null

  const spanMap = new Map<string, ProcessedSpan>()
  for (const span of spans) {
    spanMap.set(span.spanId, span)
  }

  let rootSpan: ProcessedSpan | null = null

  for (const span of spans) {
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!
      parent.children.push(span)
    } else if (!span.parentSpanId) {
      rootSpan = span
    }
  }

  // If no explicit root, find the span with earliest start time
  if (!rootSpan) {
    rootSpan = spans.reduce((earliest, span) =>
      span.startTime < earliest.startTime ? span : earliest
    )
  }

  // Sort children by start time
  const sortChildren = (span: ProcessedSpan) => {
    span.children.sort((a, b) => a.startTime - b.startTime)
    span.children.forEach(sortChildren)
  }
  sortChildren(rootSpan)

  return rootSpan
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || id.length < 8) {
    return NextResponse.json(
      { error: 'Invalid trace ID' },
      { status: 400 }
    )
  }

  const tempoUrl = process.env.TEMPO_URL || 'http://localhost:3200'

  try {
    const res = await fetch(`${tempoUrl}/api/traces/${id}`, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Trace not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: `Tempo returned ${res.status}` },
        { status: res.status }
      )
    }

    const tempoTrace: TempoTrace = await res.json()

    // Process all spans from all batches
    const allSpans: ProcessedSpan[] = []
    const services = new Set<string>()

    for (const batch of tempoTrace.batches || []) {
      const serviceName = getServiceName(batch)
      services.add(serviceName)

      for (const scopeSpan of batch.scopeSpans || []) {
        for (const span of scopeSpan.spans || []) {
          allSpans.push(processSpan(span, serviceName))
        }
      }
    }

    if (allSpans.length === 0) {
      return NextResponse.json(
        { error: 'Trace has no spans' },
        { status: 404 }
      )
    }

    const rootSpan = buildSpanTree(allSpans)
    if (!rootSpan) {
      return NextResponse.json(
        { error: 'Could not build span tree' },
        { status: 500 }
      )
    }

    // Calculate total duration from root span
    const totalDuration = rootSpan.duration

    const response: TraceResponse = {
      traceId: id,
      rootSpan,
      spanCount: allSpans.length,
      duration: totalDuration,
      services: Array.from(services),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching trace:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch trace from Tempo',
      },
      { status: 500 }
    )
  }
}
