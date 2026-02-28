import { NextRequest, NextResponse } from 'next/server'
import { processLinearWebhook } from '@/server/integrations/linear-service'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('LINEAR_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const payload = await request.text()
  const signature = request.headers.get('linear-signature') ?? request.headers.get('x-linear-signature')
  const deliveryId =
    request.headers.get('x-linear-delivery')
    ?? request.headers.get('linear-delivery')
    ?? request.headers.get('x-request-id')

  try {
    await processLinearWebhook(payload, signature, deliveryId ?? undefined)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Linear webhook processing failed',
      },
      { status: 400 }
    )
  }
}
