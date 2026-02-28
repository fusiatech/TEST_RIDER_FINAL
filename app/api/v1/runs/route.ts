import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jobQueue } from '@/server/job-queue'
import { AgentSelectionModeSchema, CLIProvider, EnqueueAttachmentSchema, validateAttachments } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { auditJobStart } from '@/lib/audit'
import { withValidation } from '@/lib/validation-middleware'
import { PaginationSchema, IdSchema } from '@/lib/schemas/common'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'
import { getDefaultWorkspaceQuotaPolicy } from '@/server/workspace-quotas'
import { auth } from '@/auth'

const RunsQuerySchema = PaginationSchema.partial().extend({
  status: z.enum(['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']).optional(),
})

const CreateRunSchema = z.object({
  sessionId: IdSchema,
  prompt: z.string().min(1).max(100000),
  mode: z.enum(['chat', 'swarm', 'project']),
  intent: z.enum(['auto', 'plan', 'one_line_fix', 'code_implementation', 'code_review', 'explain', 'debug']).optional(),
  agentSelectionMode: AgentSelectionModeSchema.optional(),
  preferredAgent: CLIProvider.optional(),
  traceModeValidation: z.boolean().optional(),
  idempotencyKey: z.string().min(1).optional(),
  attachments: z.array(EnqueueAttachmentSchema).max(10).optional(),
  priority: z.number().int().min(0).max(100).optional(),
})

export const GET = withValidation(
  { query: RunsQuerySchema },
  async ({ query, request }) => {
    const versionInfo = getApiVersion(request)
    let runs = await jobQueue.getAllJobs()
    if (query.status) {
      runs = runs.filter((run) => run.status === query.status)
    }

    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const offset = query.offset ?? (page - 1) * limit
    const data = runs.slice(offset, offset + limit)

    const response = NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: runs.length,
        totalPages: Math.ceil(runs.length / limit),
      },
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  }
)

export const POST = withValidation(
  { body: CreateRunSchema },
  async ({ body, request }) => {
    const versionInfo = getApiVersion(request)

    const permissionError = await requirePermission('canRunSwarms')
    if (permissionError) return permissionError
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (body.attachments && body.attachments.length > 0) {
      const validation = validateAttachments(body.attachments)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
    }
    const quota = getDefaultWorkspaceQuotaPolicy()
    if (jobQueue.getActiveJobCount() >= quota.maxConcurrentRuns) {
      return NextResponse.json(
        {
          error: `Concurrent run quota exceeded (${jobQueue.getActiveJobCount()} >= ${quota.maxConcurrentRuns})`,
        },
        { status: 429 }
      )
    }

    const run = jobQueue.enqueue({
      ...body,
      userId: session.user.id,
    })
    await auditJobStart(run.id, body.prompt, body.mode)

    const response = NextResponse.json(run, { status: 201 })
    return addVersionHeaders(response, versionInfo)
  }
)
