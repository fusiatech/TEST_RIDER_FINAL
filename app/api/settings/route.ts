import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings, getUserApiKeys, saveUserApiKeys } from '@/server/storage'
import {
  SettingsSchema,
  ApiKeysSchema,
  type ApiKeys,
  type Settings,
} from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { auditSettingsUpdate, auditApiKeyRotate } from '@/lib/audit'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { auth } from '@/auth'

const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/settings']
const REDACTED_SECRET = '********'

async function applyRateLimit(request: NextRequest): Promise<{ response: NextResponse | null; headers: Headers }> {
  let userId: string | null = null
  try {
    const session = await auth()
    userId = session?.user?.id ?? null
  } catch {
    // Auth not available
  }

  const { success, headers, ipResult, userResult } = await checkDualRateLimit(
    request,
    RATE_LIMIT_CONFIG,
    userId
  )

  if (!success) {
    const effectiveResult = userResult && !userResult.success ? userResult : ipResult
    return {
      response: new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((effectiveResult.reset - Date.now()) / 1000)} seconds.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(headers.entries()),
          },
        }
      ),
      headers,
    }
  }
  return { response: null, headers }
}

function redactApiKeys(apiKeys: ApiKeys | undefined): ApiKeys | undefined {
  if (!apiKeys) return apiKeys

  const redacted: ApiKeys = {}
  for (const [key, value] of Object.entries(apiKeys)) {
    if (value) {
      redacted[key as keyof ApiKeys] = REDACTED_SECRET
    }
  }
  return redacted
}

function redactSettings(settings: Settings): Settings {
  return {
    ...settings,
    apiKeys: redactApiKeys(settings.apiKeys),
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const settings = await getSettings()
    const userApiKeys = await getUserApiKeys(session.user.id)
    const response = NextResponse.json(
      redactSettings({
        ...settings,
        apiKeys: userApiKeys,
      })
    )
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canConfigureSettings')
  if (permissionError) return permissionError

  try {
    const body: unknown = await request.json()
    const result = SettingsSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid settings: ${result.error.message}` },
        { status: 400 }
      )
    }
    const existing = await getSettings()
    const updated: Settings = {
      ...result.data,
      // Secrets are intentionally write-only via PATCH.
      apiKeys: existing.apiKeys,
    }
    await saveSettings(updated)
    await auditSettingsUpdate({ changedFields: Object.keys(result.data) })
    const response = NextResponse.json(redactSettings(updated))
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const SettingsSecretsSchema = ApiKeysSchema

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: unknown = await request.json()
    const result = SettingsSecretsSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid api keys payload: ${result.error.message}` },
        { status: 400 }
      )
    }

    const existing = await getUserApiKeys(session.user.id)
    const merged: ApiKeys = { ...(existing ?? {}) }

    for (const [key, rawValue] of Object.entries(result.data)) {
      const value = (rawValue ?? '').trim()
      if (value === REDACTED_SECRET) {
        continue
      }
      if (value.length === 0) {
        delete merged[key as keyof ApiKeys]
      } else {
        merged[key as keyof ApiKeys] = value
      }
    }

    await saveUserApiKeys(session.user.id, merged)
    
    for (const key of Object.keys(result.data)) {
      await auditApiKeyRotate(key)
    }

    const response = NextResponse.json({
      success: true,
      apiKeys: redactApiKeys(merged),
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
