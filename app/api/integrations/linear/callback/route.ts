import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'
import { finalizeLinearCallback } from '@/server/integrations/linear-service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('LINEAR_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  if (!state || !code) {
    return NextResponse.json({ error: 'Missing state or code' }, { status: 400 })
  }

  try {
    const callbackUrl = `${request.nextUrl.origin}/api/integrations/linear/callback`
    const result = await finalizeLinearCallback({ state, code, callbackUrl })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { connected: false, error: error instanceof Error ? error.message : 'Linear callback failed' },
      { status: 400 }
    )
  }
}
