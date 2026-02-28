import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditBillingCheckout } from '@/lib/audit'
import { BillingPlanSchema } from '@/lib/contracts/backend'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { createCheckoutSessionForUser } from '@/server/billing/service'
import { validateBillingRedirectUrl } from '@/server/billing/redirect-policy'

const CheckoutRequestSchema = z.object({
  plan: BillingPlanSchema.refine((plan) => plan !== 'free', 'Free plan does not require checkout'),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('BILLING_STRIPE')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => null)
  const parsed = CheckoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid checkout payload: ${parsed.error.message}`)
  }

  const result = await createCheckoutSessionForUser({
    user: authResult.user,
    plan: parsed.data.plan,
    successUrl: validateBillingRedirectUrl(parsed.data.successUrl, request.nextUrl.origin),
    cancelUrl: validateBillingRedirectUrl(parsed.data.cancelUrl, request.nextUrl.origin),
  })

  await auditBillingCheckout({
    userId: authResult.user.id,
    plan: parsed.data.plan,
    sessionId: result.sessionId,
  })

  return NextResponse.json(result)
}
