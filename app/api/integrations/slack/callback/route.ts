import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'
import { finalizeSlackCallback } from '@/server/integrations/slack-service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('SLACK_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  if (!state || !code) {
    return NextResponse.json({ error: 'Missing state or code' }, { status: 400 })
  }

  try {
    const callbackUrl = `${request.nextUrl.origin}/api/integrations/slack/callback`
    const result = await finalizeSlackCallback({ state, code, callbackUrl })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { connected: false, error: error instanceof Error ? error.message : 'Slack callback failed' },
      { status: 400 }
    )
  }
}
