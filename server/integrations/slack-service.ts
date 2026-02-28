import crypto from 'node:crypto'
import { consumeOAuthState, createOAuthState, deleteIntegrationConnection, getIntegrationConnection, isWebhookEventDuplicate, recordWebhookDelivery, updateIntegrationStatus } from '@/server/integrations/store'

const SLACK_AUTH_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access'

function slackClientId(): string | null {
  return process.env.SLACK_CLIENT_ID?.trim() || null
}

function slackClientSecret(): string | null {
  return process.env.SLACK_CLIENT_SECRET?.trim() || null
}

function slackSigningSecret(): string {
  const secret = process.env.SLACK_SIGNING_SECRET?.trim()
  if (!secret) {
    throw new Error('SLACK_SIGNING_SECRET is not configured')
  }
  return secret
}

export async function createSlackConnectUrl(userId: string, callbackUrl: string): Promise<{ url: string; state: string }> {
  const clientId = slackClientId()
  if (!clientId) {
    throw new Error('SLACK_CLIENT_ID is not configured')
  }

  const state = await createOAuthState(userId, 'slack', { callbackUrl })
  const url = new URL(SLACK_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('scope', process.env.SLACK_SCOPES ?? 'chat:write,channels:read,groups:read')
  url.searchParams.set('redirect_uri', callbackUrl)
  url.searchParams.set('state', state)

  return {
    url: url.toString(),
    state,
  }
}

export async function finalizeSlackCallback(params: {
  state: string
  code: string
  callbackUrl: string
}): Promise<{ connected: boolean; team?: string }> {
  const clientId = slackClientId()
  const clientSecret = slackClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error('Slack OAuth client credentials are not configured')
  }

  const oauthState = await consumeOAuthState(params.state)
  if (!oauthState || oauthState.provider !== 'slack') {
    throw new Error('Invalid or expired Slack OAuth state')
  }

  const form = new URLSearchParams()
  form.set('client_id', clientId)
  form.set('client_secret', clientSecret)
  form.set('code', params.code)
  form.set('redirect_uri', params.callbackUrl)

  const tokenResponse = await fetch(SLACK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  const payload = (await tokenResponse.json()) as {
    ok?: boolean
    error?: string
    access_token?: string
    team?: { id?: string; name?: string }
    authed_user?: { id?: string }
    incoming_webhook?: { url?: string; channel?: string }
    scope?: string
  }

  if (!tokenResponse.ok || !payload.ok || !payload.access_token) {
    throw new Error(payload.error || `Slack OAuth token exchange failed (${tokenResponse.status})`)
  }

  const scopes = payload.scope ? payload.scope.split(',').map((s) => s.trim()).filter(Boolean) : []

  await updateIntegrationStatus(oauthState.userId, 'slack', 'connected', {
    externalId: payload.team?.id,
    displayName: payload.team?.name,
    scopes,
    metadata: {
      teamId: payload.team?.id,
      teamName: payload.team?.name,
      defaultChannel: payload.incoming_webhook?.channel,
      mode: 'oauth',
    },
    credentials: {
      botToken: payload.access_token,
      webhookUrl: payload.incoming_webhook?.url ?? '',
      authedUserId: payload.authed_user?.id ?? '',
    },
  })

  return {
    connected: true,
    team: payload.team?.name,
  }
}

export async function getSlackStatus(userId: string): Promise<Record<string, unknown>> {
  const connection = await getIntegrationConnection(userId, 'slack')
  if (!connection) {
    return { connected: false }
  }
  return {
    connected: connection.status === 'connected',
    team: connection.displayName,
    teamId: connection.externalId,
    scopes: connection.scopes,
    hasWebhookUrl: Boolean(connection.credentials?.webhookUrl),
  }
}

export async function disconnectSlack(userId: string): Promise<void> {
  await deleteIntegrationConnection(userId, 'slack')
}

export function verifySlackWebhookSignature(payload: string, timestampHeader: string | null, signatureHeader: string | null): boolean {
  if (!timestampHeader || !signatureHeader) return false

  const timestamp = Number(timestampHeader)
  if (!Number.isFinite(timestamp)) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
  if (age > 300) return false

  const base = `v0:${timestamp}:${payload}`
  const expected = `v0=${crypto.createHmac('sha256', slackSigningSecret()).update(base, 'utf8').digest('hex')}`

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(signatureHeader)
  if (expectedBuffer.length !== providedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

export async function processSlackWebhook(payload: string, timestampHeader: string | null, signatureHeader: string | null): Promise<Record<string, unknown>> {
  const valid = verifySlackWebhookSignature(payload, timestampHeader, signatureHeader)
  if (!valid) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'slack',
      signatureValid: false,
      processed: false,
      receivedAt: Date.now(),
      error: 'Invalid Slack signature',
    })
    throw new Error('Invalid Slack signature')
  }

  const body = JSON.parse(payload) as Record<string, unknown>
  const eventId = typeof body.event_id === 'string' ? body.event_id : undefined

  if (eventId && await isWebhookEventDuplicate('slack', eventId)) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'slack',
      eventId,
      signatureValid: true,
      processed: true,
      receivedAt: Date.now(),
      error: 'Duplicate delivery ignored',
    })
    return {
      ...body,
      duplicate: true,
    }
  }

  await recordWebhookDelivery({
    id: crypto.randomUUID(),
    provider: 'slack',
    eventId,
    signatureValid: true,
    processed: true,
    receivedAt: Date.now(),
  })

  return body
}
