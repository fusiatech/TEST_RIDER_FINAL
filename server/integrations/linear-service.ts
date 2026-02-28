import crypto from 'node:crypto'
import { consumeOAuthState, createOAuthState, deleteIntegrationConnection, getIntegrationConnection, isWebhookEventDuplicate, listExternalIssueLinks, recordWebhookDelivery, updateIntegrationStatus, upsertExternalIssueLink } from '@/server/integrations/store'

const LINEAR_AUTH_URL = 'https://linear.app/oauth/authorize'
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token'
const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql'

function linearClientId(): string | null {
  return process.env.LINEAR_CLIENT_ID?.trim() || null
}

function linearClientSecret(): string | null {
  return process.env.LINEAR_CLIENT_SECRET?.trim() || null
}

function linearWebhookSecret(): string {
  const secret = process.env.LINEAR_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('LINEAR_WEBHOOK_SECRET is not configured')
  }
  return secret
}

export async function createLinearConnectUrl(userId: string, callbackUrl: string): Promise<{ url: string; state: string }> {
  const clientId = linearClientId()
  if (!clientId) {
    throw new Error('LINEAR_CLIENT_ID is not configured')
  }

  const state = await createOAuthState(userId, 'linear', { callbackUrl })
  const url = new URL(LINEAR_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', callbackUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', process.env.LINEAR_SCOPES ?? 'read write')
  url.searchParams.set('state', state)

  return {
    url: url.toString(),
    state,
  }
}

async function exchangeLinearCode(code: string, redirectUri: string): Promise<{ accessToken: string }> {
  const clientId = linearClientId()
  const clientSecret = linearClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error('Linear OAuth credentials are not configured')
  }

  const response = await fetch(LINEAR_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  const payload = (await response.json()) as {
    access_token?: string
    error?: string
  }

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error || `Linear token exchange failed (${response.status})`)
  }

  return { accessToken: payload.access_token }
}

async function fetchLinearViewer(accessToken: string): Promise<{ id: string; name: string; email: string }> {
  const query = {
    query: '{ viewer { id name email } }',
  }

  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessToken,
    },
    body: JSON.stringify(query),
  })

  const payload = (await response.json()) as {
    data?: { viewer?: { id: string; name: string; email: string } }
    errors?: Array<{ message: string }>
  }

  if (!response.ok || payload.errors?.length || !payload.data?.viewer) {
    const message = payload.errors?.[0]?.message ?? `Linear viewer query failed (${response.status})`
    throw new Error(message)
  }

  return payload.data.viewer
}

export async function finalizeLinearCallback(params: {
  state: string
  code: string
  callbackUrl: string
}): Promise<{ connected: boolean; viewer?: string }> {
  const oauthState = await consumeOAuthState(params.state)
  if (!oauthState || oauthState.provider !== 'linear') {
    throw new Error('Invalid or expired Linear OAuth state')
  }

  const token = await exchangeLinearCode(params.code, params.callbackUrl)
  const viewer = await fetchLinearViewer(token.accessToken)

  await updateIntegrationStatus(oauthState.userId, 'linear', 'connected', {
    externalId: viewer.id,
    displayName: viewer.name,
    scopes: ['read', 'write'],
    metadata: {
      email: viewer.email,
      mode: 'oauth',
    },
    credentials: {
      accessToken: token.accessToken,
    },
  })

  return {
    connected: true,
    viewer: viewer.name,
  }
}

export async function getLinearStatus(userId: string): Promise<Record<string, unknown>> {
  const connection = await getIntegrationConnection(userId, 'linear')
  if (!connection) {
    return { connected: false, issueLinks: 0 }
  }

  const links = await listExternalIssueLinks(userId)
  return {
    connected: connection.status === 'connected',
    viewer: connection.displayName,
    externalId: connection.externalId,
    issueLinks: links.length,
    scopes: connection.scopes,
  }
}

export async function disconnectLinear(userId: string): Promise<void> {
  await deleteIntegrationConnection(userId, 'linear')
}

export function verifyLinearWebhookSignature(payload: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const expected = crypto.createHmac('sha256', linearWebhookSecret()).update(payload, 'utf8').digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(signatureHeader)
  if (expectedBuffer.length !== providedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

export async function processLinearWebhook(payload: string, signatureHeader: string | null, deliveryId?: string): Promise<Record<string, unknown>> {
  const valid = verifyLinearWebhookSignature(payload, signatureHeader)
  if (!valid) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'linear',
      signatureValid: false,
      processed: false,
      receivedAt: Date.now(),
      error: 'Invalid Linear signature',
    })
    throw new Error('Invalid Linear signature')
  }

  const body = JSON.parse(payload) as Record<string, unknown>
  const dedupeKey = deliveryId
    || (typeof body.action === 'string' ? body.action : undefined)
    || crypto.createHash('sha256').update(payload, 'utf8').digest('hex')

  if (await isWebhookEventDuplicate('linear', dedupeKey)) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'linear',
      eventId: dedupeKey,
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

  const data = body.data as Record<string, unknown> | undefined
  const issue = data?.issue as Record<string, unknown> | undefined
  const externalIssueId = typeof issue?.id === 'string' ? issue.id : undefined
  const externalIssueKey = typeof issue?.identifier === 'string' ? issue.identifier : undefined
  const metadata = data?.metadata as Record<string, unknown> | undefined
  const userId = typeof metadata?.userId === 'string' ? metadata.userId : undefined
  const projectId = typeof metadata?.projectId === 'string' ? metadata.projectId : undefined
  const ticketId = typeof metadata?.ticketId === 'string' ? metadata.ticketId : undefined

  if (userId && projectId && ticketId && externalIssueId) {
    await upsertExternalIssueLink({
      id: `${userId}:${projectId}:${ticketId}`,
      userId,
      provider: 'linear',
      projectId,
      ticketId,
      externalIssueId,
      externalIssueKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  await recordWebhookDelivery({
    id: crypto.randomUUID(),
    provider: 'linear',
    eventId: dedupeKey,
    signatureValid: true,
    processed: true,
    receivedAt: Date.now(),
  })

  return body
}
