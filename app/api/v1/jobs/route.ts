import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { z } from 'zod'
import { EnqueueAttachmentSchema, validateAttachments } from '@/lib/types'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { requirePermission } from '@/lib/permissions'
import { auditJobStart } from '@/lib/audit'
import { withValidation } from '@/lib/validation-middleware'
import { PaginationSchema, IdSchema } from '@/lib/schemas/common'
import { auth } from '@/auth'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/jobs']

async function applyRateLimit(request: NextRequest): Promise<{ response: NextResponse | null; headers: Headers }> {
  let userId: string | null = null
  try {
    const session = await auth()
    userId = session?.user?.id ?? null
  } catch {
    // Auth not available
  }

  const { success, headers, ipResult, userResult } = await checkDualRateLimit(
    request,
    RATE_LIMIT_CONFIG,
    userId
  )

  if (!success) {
    const effectiveResult = userResult && !userResult.success ? userResult : ipResult
    return {
      response: new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((effectiveResult.reset - Date.now()) / 1000)} seconds.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(headers.entries()),
          },
        }
      ),
      headers,
    }
  }
  return { response: null, headers }
}

const JobsQuerySchema = PaginationSchema.partial().extend({
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
})

export const GET = withValidation(
  { query: JobsQuerySchema },
  async ({ query, request }) => {
    const versionInfo = getApiVersion(request)
    const { response: rateLimitResponse, headers } = await applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    let jobs = await jobQueue.getAllJobs()
    
    if (query.status) {
      jobs = jobs.filter((job) => job.status === query.status)
    }
    
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const offset = query.offset ?? (page - 1) * limit
    
    const paginatedJobs = jobs.slice(offset, offset + limit)
    
    const response = NextResponse.json({
      data: paginatedJobs,
      pagination: {
        page,
        limit,
        total: jobs.length,
        totalPages: Math.ceil(jobs.length / limit),
      },
      apiVersion: versionInfo.version,
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return addVersionHeaders(response, versionInfo)
  }
)

const EnqueueSchema = z.object({
  sessionId: IdSchema,
  prompt: z.string().min(1, 'Prompt is required').max(100000, 'Prompt too long'),
  mode: z.enum(['chat', 'swarm', 'project']),
  idempotencyKey: z.string().min(1).optional(),
  attachments: z.array(EnqueueAttachmentSchema).max(10).optional(),
  priority: z.number().int().min(0).max(100).optional(),
})

export const POST = withValidation(
  { body: EnqueueSchema },
  async ({ body, request }) => {
    const versionInfo = getApiVersion(request)
    const { response: rateLimitResponse, headers } = await applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const permissionError = await requirePermission('canRunSwarms')
    if (permissionError) return permissionError

    if (body.attachments && body.attachments.length > 0) {
      const validation = validateAttachments(body.attachments)
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        )
      }
    }
    const job = jobQueue.enqueue(body)
    await auditJobStart(job.id, body.prompt, body.mode)
    const response = NextResponse.json(job, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return addVersionHeaders(response, versionInfo)
  }
)

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const versionInfo = getApiVersion(request)
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const cancelledCount = await jobQueue.cancelAllQueued()
  const response = NextResponse.json({ 
    cancelled: cancelledCount,
    apiVersion: versionInfo.version,
  })
  headers.forEach((value, key) => response.headers.set(key, value))
  return addVersionHeaders(response, versionInfo)
}
