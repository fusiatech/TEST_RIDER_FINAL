import { NextResponse } from 'next/server'
import { auditIntegrationDisconnect } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { disconnectLinear } from '@/server/integrations/linear-service'

export async function DELETE(): Promise<NextResponse> {
  const gate = requireFeature('LINEAR_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  await disconnectLinear(authResult.user.id)
  await auditIntegrationDisconnect('linear', { userId: authResult.user.id })
  return NextResponse.json({ ok: true })
}
