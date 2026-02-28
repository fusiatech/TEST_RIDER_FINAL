import { NextRequest, NextResponse } from 'next/server'
import { processSlackWebhook } from '@/server/integrations/slack-service'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('SLACK_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const payload = await request.text()
  const timestamp = request.headers.get('x-slack-request-timestamp')
  const signature = request.headers.get('x-slack-signature')

  try {
    const body = await processSlackWebhook(payload, timestamp, signature)

    // Slack URL verification challenge
    if (typeof body.type === 'string' && body.type === 'url_verification' && typeof body.challenge === 'string') {
      return NextResponse.json({ challenge: body.challenge })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Slack webhook processing failed',
      },
      { status: 400 }
    )
  }
}
