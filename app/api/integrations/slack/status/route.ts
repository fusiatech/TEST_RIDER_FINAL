import { NextResponse } from 'next/server'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { getSlackStatus } from '@/server/integrations/slack-service'

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('SLACK_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const status = await getSlackStatus(authResult.user.id)
  return NextResponse.json(status)
}
