import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { withApiMetrics } from '@/server/api-observability'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withApiMetrics('/api/jobs/[id]', 'GET', request, async () => {
    try {
      const { id } = await params
      const job = await jobQueue.getJob(id)
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      return NextResponse.json(job)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withApiMetrics('/api/jobs/[id]', 'DELETE', request, async () => {
    try {
      const { id } = await params
      const job = await jobQueue.getJob(id)
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      await jobQueue.cancelJob(id)
      return new NextResponse(null, { status: 204 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
