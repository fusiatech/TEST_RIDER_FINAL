import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { z } from 'zod'
import { EnqueueAttachmentSchema, validateAttachments } from '@/lib/types'
import { withApiMetrics } from '@/server/api-observability'

export async function GET(): Promise<NextResponse> {
  return withApiMetrics('/api/jobs', 'GET', null, async () => {
    try {
      const jobs = await jobQueue.getAllJobs()
      return NextResponse.json(jobs)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}

const EnqueueSchema = z.object({
  sessionId: z.string(),
  prompt: z.string(),
  mode: z.enum(['chat', 'swarm', 'project']),
  attachments: z.array(EnqueueAttachmentSchema).max(10).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withApiMetrics('/api/jobs', 'POST', request, async () => {
    try {
      const body: unknown = await request.json()
      const result = EnqueueSchema.safeParse(body)
      if (!result.success) {
        return NextResponse.json(
          { error: `Invalid job: ${result.error.message}` },
          { status: 400 }
        )
      }
      const data = result.data
      if (data.attachments && data.attachments.length > 0) {
        const validation = validateAttachments(data.attachments)
        if (!validation.ok) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400 }
          )
        }
      }
      const job = jobQueue.enqueue(data)
      return NextResponse.json(job, { status: 201 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
