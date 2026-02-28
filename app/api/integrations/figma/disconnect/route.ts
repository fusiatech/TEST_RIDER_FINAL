import { NextResponse } from 'next/server'
import { auditIntegrationDisconnect } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { disconnectFigmaForUser } from '@/server/integrations/figma-service'

export async function DELETE(): Promise<NextResponse> {
  const gate = requireFeature('FIGMA_USER_SCOPED')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  await disconnectFigmaForUser(authResult.user.id)
  await auditIntegrationDisconnect('figma', { userId: authResult.user.id })

  return NextResponse.json({ ok: true })
}
