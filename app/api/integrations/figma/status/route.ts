import { NextResponse } from 'next/server'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { getFigmaStatusForUser } from '@/server/integrations/figma-service'

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('FIGMA_USER_SCOPED')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const status = await getFigmaStatusForUser(authResult.user.id)
  return NextResponse.json(status)
}
