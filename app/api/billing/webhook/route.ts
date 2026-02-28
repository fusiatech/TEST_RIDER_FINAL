import { NextRequest, NextResponse } from 'next/server'
import { auditBillingWebhook } from '@/lib/audit'
import { processStripeWebhook } from '@/server/billing/service'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('BILLING_STRIPE')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  try {
    const result = await processStripeWebhook(payload, signature)
    await auditBillingWebhook({ processed: true, duplicate: Boolean(result.duplicate) })
    return NextResponse.json({ ok: true, duplicate: Boolean(result.duplicate) })
  } catch (error) {
    await auditBillingWebhook({ processed: false, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Webhook processing failed',
      },
      { status: 400 }
    )
  }
}
