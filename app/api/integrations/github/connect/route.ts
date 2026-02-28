import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auditIntegrationConnect } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { createGitHubConnectUrl } from '@/server/integrations/github-service'

const ConnectRequestSchema = z.object({
  callbackUrl: z.string().url().optional(),
})

function resolveCallbackUrl(request: NextRequest, callbackUrl?: string): string {
  const fallback = `${request.nextUrl.origin}/api/integrations/github/callback`
  if (!callbackUrl) return fallback
  const parsed = new URL(callbackUrl)
  if (parsed.origin !== request.nextUrl.origin) {
    throw new Error('callbackUrl must match current origin')
  }
  return parsed.toString()
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('GITHUB_INTEGRATION')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const body = await request.json().catch(() => ({}))
  const parsed = ConnectRequestSchema.safeParse(body)
  if (!parsed.success) {
    return badRequest(`Invalid connect payload: ${parsed.error.message}`)
  }

  let callbackUrl: string
  try {
    callbackUrl = resolveCallbackUrl(request, parsed.data.callbackUrl)
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Invalid callbackUrl')
  }
  const connect = await createGitHubConnectUrl(authResult.user.id, callbackUrl)

  await auditIntegrationConnect('github', {
    userId: authResult.user.id,
    mode: connect.mode,
  })

  return NextResponse.json(connect)
}
