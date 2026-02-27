import { NextResponse } from 'next/server'
import { getPrometheusMetrics } from '@/server/observability'

export async function GET(): Promise<NextResponse> {
  const body = getPrometheusMetrics()
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
