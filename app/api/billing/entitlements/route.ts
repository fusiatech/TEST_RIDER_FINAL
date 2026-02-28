import { NextResponse } from 'next/server'
import { getEntitlementsForUser } from '@/server/billing/service'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('BILLING_STRIPE')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const entitlements = await getEntitlementsForUser(authResult.user.id)
  return NextResponse.json({ entitlements })
}
