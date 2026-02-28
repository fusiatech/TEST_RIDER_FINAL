import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listExternalIssueLinks, upsertExternalIssueLink } from '@/server/integrations/store'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'

const CreateLinkSchema = z.object({
  projectId: z.string(),
  ticketId: z.string(),
  externalIssueId: z.string(),
  externalIssueKey: z.string().optional(),
})

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('LINEAR_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const links = await listExternalIssueLinks(authResult.user.id)
  return NextResponse.json({ links })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('LINEAR_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => null)
  const parsed = CreateLinkSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid issue link payload: ${parsed.error.message}`)
  }

  const now = Date.now()
  const link = await upsertExternalIssueLink({
    id: crypto.randomUUID(),
    userId: authResult.user.id,
    provider: 'linear',
    projectId: parsed.data.projectId,
    ticketId: parsed.data.ticketId,
    externalIssueId: parsed.data.externalIssueId,
    externalIssueKey: parsed.data.externalIssueKey,
    createdAt: now,
    updatedAt: now,
  })

  return NextResponse.json({ link }, { status: 201 })
}
