import { NextResponse } from 'next/server'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { getGitHubStatus } from '@/server/integrations/github-service'

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('GITHUB_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const status = await getGitHubStatus(authResult.user.id)
  return NextResponse.json(status)
}
