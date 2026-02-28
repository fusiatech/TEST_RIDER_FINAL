import crypto from 'node:crypto'
import { isGitHubAuthenticated } from '@/server/github-integration'
import { consumeOAuthState, createOAuthState, deleteIntegrationConnection, getIntegrationConnection, isWebhookEventDuplicate, recordWebhookDelivery, updateIntegrationStatus } from '@/server/integrations/store'

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

function githubClientId(): string | null {
  return process.env.GITHUB_APP_CLIENT_ID?.trim() || process.env.GITHUB_ID?.trim() || null
}

function githubClientSecret(): string | null {
  return process.env.GITHUB_APP_CLIENT_SECRET?.trim() || process.env.GITHUB_SECRET?.trim() || null
}

function githubAppSlug(): string | null {
  return process.env.GITHUB_APP_SLUG?.trim() || null
}

function githubWebhookSecret(): string {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET is not configured')
  }
  return secret
}

function computeStateHash(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function createGitHubConnectUrl(userId: string, callbackUrl: string): Promise<{ mode: 'oauth' | 'app_install' | 'local_cli'; url: string | null; state?: string }> {
  const clientId = githubClientId()
  const appSlug = githubAppSlug()

  if (appSlug) {
    const state = await createOAuthState(userId, 'github', {
      callbackUrl,
      mode: 'app_install',
    })
    const url = `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new?state=${encodeURIComponent(state)}`
    return { mode: 'app_install', url, state }
  }

  if (clientId) {
    const state = await createOAuthState(userId, 'github', {
      callbackUrl,
      mode: 'oauth',
      stateHash: computeStateHash(`${userId}:${Date.now()}:${Math.random()}`),
    })

    const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL)
    authorizeUrl.searchParams.set('client_id', clientId)
    authorizeUrl.searchParams.set('redirect_uri', callbackUrl)
    authorizeUrl.searchParams.set('scope', 'repo read:user read:org workflow')
    authorizeUrl.searchParams.set('state', state)

    return { mode: 'oauth', url: authorizeUrl.toString(), state }
  }

  return { mode: 'local_cli', url: null }
}

async function exchangeCodeForToken(params: {
  code: string
  redirectUri: string
}): Promise<string> {
  const clientId = githubClientId()
  const clientSecret = githubClientSecret()
  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth credentials are not configured')
  }

  const body = new URLSearchParams()
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('code', params.code)
  body.set('redirect_uri', params.redirectUri)

  const tokenResponse = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => '')
    throw new Error(`GitHub OAuth token exchange failed (${tokenResponse.status}): ${text}`)
  }

  const payload = (await tokenResponse.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (!payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'GitHub token exchange returned no access token')
  }

  return payload.access_token
}

async function fetchGitHubIdentity(accessToken: string): Promise<{
  login: string
  id: number
  name?: string | null
}> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'fusia-ai-backend',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`GitHub user fetch failed (${response.status}): ${text}`)
  }

  const payload = (await response.json()) as {
    login: string
    id: number
    name?: string | null
  }

  return payload
}

export async function finalizeGitHubCallback(params: {
  state: string
  code?: string
  installationId?: string
  setupAction?: string
  callbackUrl: string
}): Promise<{ connected: boolean; mode: string; login?: string }> {
  const oauthState = await consumeOAuthState(params.state)
  if (!oauthState || oauthState.provider !== 'github') {
    throw new Error('Invalid or expired OAuth state')
  }

  const userId = oauthState.userId

  if (params.code) {
    const token = await exchangeCodeForToken({
      code: params.code,
      redirectUri: params.callbackUrl,
    })

    const identity = await fetchGitHubIdentity(token)

    await updateIntegrationStatus(userId, 'github', 'connected', {
      externalId: String(identity.id),
      displayName: identity.login,
      scopes: ['repo', 'read:user', 'read:org', 'workflow'],
      metadata: {
        login: identity.login,
        name: identity.name,
        installationId: params.installationId,
        setupAction: params.setupAction,
        mode: 'oauth',
      },
      credentials: {
        accessToken: token,
      },
    })

    return { connected: true, mode: 'oauth', login: identity.login }
  }

  if (params.installationId) {
    await updateIntegrationStatus(userId, 'github', 'connected', {
      externalId: params.installationId,
      metadata: {
        installationId: params.installationId,
        setupAction: params.setupAction,
        mode: 'app_install',
      },
    })
    return { connected: true, mode: 'app_install' }
  }

  throw new Error('GitHub callback did not include a code or installation ID')
}

export async function getGitHubStatus(userId: string): Promise<Record<string, unknown>> {
  const connection = await getIntegrationConnection(userId, 'github')
  if (connection) {
    return {
      connected: connection.status === 'connected',
      mode: (connection.metadata?.mode as string | undefined) ?? 'oauth',
      login: connection.displayName,
      scopes: connection.scopes,
      lastSyncedAt: connection.lastSyncedAt,
      installationId: connection.metadata?.installationId,
    }
  }

  const localCliAuth = await isGitHubAuthenticated().catch(() => false)
  if (localCliAuth) {
    return {
      connected: true,
      mode: 'local_cli',
      login: null,
      scopes: [],
      lastSyncedAt: undefined,
    }
  }

  return {
    connected: false,
    mode: 'disconnected',
  }
}

export async function disconnectGitHub(userId: string): Promise<void> {
  await deleteIntegrationConnection(userId, 'github')
}

export function verifyGitHubWebhookSignature(payload: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false
  const expected = `sha256=${crypto.createHmac('sha256', githubWebhookSecret()).update(payload, 'utf8').digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signatureHeader)
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function processGitHubWebhook(payload: string, signatureHeader: string | null, eventId?: string): Promise<void> {
  const signatureValid = verifyGitHubWebhookSignature(payload, signatureHeader)
  if (!signatureValid) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'github',
      eventId,
      signatureValid: false,
      processed: false,
      receivedAt: Date.now(),
      error: 'Invalid signature',
    })
    throw new Error('Invalid GitHub webhook signature')
  }

  if (eventId && await isWebhookEventDuplicate('github', eventId)) {
    await recordWebhookDelivery({
      id: crypto.randomUUID(),
      provider: 'github',
      eventId,
      signatureValid: true,
      processed: true,
      receivedAt: Date.now(),
      error: 'Duplicate delivery ignored',
    })
    return
  }

  const body = JSON.parse(payload) as Record<string, unknown>
  const installation = body.installation as { id?: number; account?: { login?: string } } | undefined
  const accountLogin = installation?.account?.login
  const installationId = installation?.id ? String(installation.id) : undefined

  await recordWebhookDelivery({
    id: crypto.randomUUID(),
    provider: 'github',
    eventId,
    signatureValid: true,
    processed: true,
    receivedAt: Date.now(),
  })

  if (!installationId) return

  // Best-effort metadata update when an installed account event arrives.
  // User mapping by installation is intentionally loose for migration compatibility.
  const allCandidates = [
    ...(process.env.DEFAULT_ADMIN_USER_ID ? [process.env.DEFAULT_ADMIN_USER_ID] : []),
  ].filter(Boolean) as string[]

  for (const userId of allCandidates) {
    await updateIntegrationStatus(userId, 'github', 'connected', {
      externalId: installationId,
      metadata: {
        installationId,
        accountLogin,
        lastWebhookEventAt: Date.now(),
      },
    }).catch(() => undefined)
  }
}
