import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditIntegrationConnect, auditIntegrationSecretRotate } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { connectFigmaForUser } from '@/server/integrations/figma-service'

const ConnectSchema = z.object({
  accessToken: z.string().min(10),
  teamId: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('FIGMA_USER_SCOPED')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => null)
  const parsed = ConnectSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid Figma connect payload: ${parsed.error.message}`)
  }

  const result = await connectFigmaForUser(authResult.user.id, parsed.data.accessToken, parsed.data.teamId)
  await auditIntegrationSecretRotate('figma', { userId: authResult.user.id })
  await auditIntegrationConnect('figma', { userId: authResult.user.id, teamId: parsed.data.teamId })

  return NextResponse.json(result)
}
