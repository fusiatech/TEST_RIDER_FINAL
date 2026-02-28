import { NextRequest, NextResponse } from 'next/server'
import { processGitHubWebhook } from '@/server/integrations/github-service'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse } from '@/server/integrations/http'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('GITHUB_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const payload = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  const eventId = request.headers.get('x-github-delivery') ?? undefined

  try {
    await processGitHubWebhook(payload, signature, eventId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'GitHub webhook failed',
      },
      { status: 400 }
    )
  }
}
