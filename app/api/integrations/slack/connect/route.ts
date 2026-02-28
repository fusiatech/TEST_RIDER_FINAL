import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditIntegrationConnect, auditIntegrationSecretRotate } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { createSlackConnectUrl, finalizeSlackCallback } from '@/server/integrations/slack-service'

const ConnectSchema = z.object({
  callbackUrl: z.string().url().optional(),
  code: z.string().optional(),
  state: z.string().optional(),
})

function resolveCallbackUrl(request: NextRequest, callbackUrl?: string): string {
  const fallback = `${request.nextUrl.origin}/api/integrations/slack/callback`
  if (!callbackUrl) return fallback
  const parsed = new URL(callbackUrl)
  if (parsed.origin !== request.nextUrl.origin) {
    throw new Error('callbackUrl must match current origin')
  }
  return parsed.toString()
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('SLACK_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => ({}))
  const parsed = ConnectSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid Slack connect payload: ${parsed.error.message}`)
  }

  let callbackUrl: string
  try {
    callbackUrl = resolveCallbackUrl(request, parsed.data.callbackUrl)
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid callbackUrl')
  }

  if (parsed.data.code && parsed.data.state) {
    const result = await finalizeSlackCallback({
      state: parsed.data.state,
      code: parsed.data.code,
      callbackUrl,
    })

    await auditIntegrationSecretRotate('slack', { userId: authResult.user.id })
    await auditIntegrationConnect('slack', { userId: authResult.user.id, mode: 'oauth' })
    return NextResponse.json(result)
  }

  const connect = await createSlackConnectUrl(authResult.user.id, callbackUrl)
  await auditIntegrationConnect('slack', { userId: authResult.user.id, requested: true })
  return NextResponse.json(connect)
}
