import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { z } from 'zod'
import { EnqueueAttachmentSchema, validateAttachments } from '@/lib/types'

export async function GET(): Promise<NextResponse> {
  try {
    const jobs = await jobQueue.getAllJobs()
    return NextResponse.json(jobs)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const EnqueueSchema = z.object({
  sessionId: z.string(),
  prompt: z.string(),
  mode: z.enum(['chat', 'swarm', 'project']),
  attachments: z.array(EnqueueAttachmentSchema).max(10).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = EnqueueSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: `Invalid job: ${result.error.message}` }, { status: 400 })
    }

    const data = result.data
    const idempotencyKey = data.idempotencyKey ?? request.headers.get('idempotency-key') ?? undefined

    if (data.attachments && data.attachments.length > 0) {
      const validation = validateAttachments(data.attachments)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
    }

    if (idempotencyKey) {
      const existingByKey = jobQueue.findByIdempotencyKey(idempotencyKey)
      if (existingByKey) {
        return NextResponse.json({ ...existingByKey, duplicateSuppressed: true }, { status: 200 })
      }
    }

    const duplicate = jobQueue.findDuplicate(data.sessionId, data.prompt, data.mode, data.attachments)
    if (duplicate) {
      return NextResponse.json({ ...duplicate, duplicateSuppressed: true }, { status: 200 })
    }

    const job = jobQueue.enqueue({ ...data, idempotencyKey })
    return NextResponse.json(job, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
