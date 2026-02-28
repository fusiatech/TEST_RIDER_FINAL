import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditBillingPortal } from '@/lib/audit'
import { createPortalSessionForUser } from '@/server/billing/service'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { validateBillingRedirectUrl } from '@/server/billing/redirect-policy'

const PortalRequestSchema = z.object({
  returnUrl: z.string().url(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('BILLING_STRIPE')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => null)
  const parsed = PortalRequestSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid portal payload: ${parsed.error.message}`)
  }

  const result = await createPortalSessionForUser({
    user: authResult.user,
    returnUrl: validateBillingRedirectUrl(parsed.data.returnUrl, request.nextUrl.origin),
  })

  await auditBillingPortal({
    userId: authResult.user.id,
  })

  return NextResponse.json(result)
}
