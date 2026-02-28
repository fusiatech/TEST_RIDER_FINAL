import { NextResponse } from 'next/server'
import { auditIntegrationDisconnect } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { disconnectGitHub } from '@/server/integrations/github-service'

export async function DELETE(): Promise<NextResponse> {
  const gate = requireFeature('GITHUB_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  await disconnectGitHub(authResult.user.id)
  await auditIntegrationDisconnect('github', { userId: authResult.user.id })

  return NextResponse.json({ ok: true })
}
