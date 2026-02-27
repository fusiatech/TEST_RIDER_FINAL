import { registry } from '@/lib/metrics'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const metrics = await registry.metrics()
    return new Response(metrics, {
      headers: { 'Content-Type': registry.contentType }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(`Error collecting metrics: ${message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}
