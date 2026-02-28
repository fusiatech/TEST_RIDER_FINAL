import { NextRequest, NextResponse } from 'next/server'
import { auditIntegrationConnect } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'
import { finalizeGitHubCallback } from '@/server/integrations/github-service'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('GITHUB_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code') ?? undefined
  const installationId = request.nextUrl.searchParams.get('installation_id') ?? undefined
  const setupAction = request.nextUrl.searchParams.get('setup_action') ?? undefined

  if (!state) {
    return NextResponse.json({ error: 'Missing state' }, { status: 400 })
  }

  try {
    const callbackUrl = `${request.nextUrl.origin}/api/integrations/github/callback`
    const result = await finalizeGitHubCallback({
      state,
      code,
      installationId,
      setupAction,
      callbackUrl,
    })

    await auditIntegrationConnect('github', {
      mode: result.mode,
      login: result.login,
      callback: true,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : 'GitHub callback failed',
      },
      { status: 400 }
    )
  }
}
