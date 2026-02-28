import { NextRequest, NextResponse } from 'next/server'
import { getSessions, saveSession } from '@/server/storage'
import { SessionSchema } from '@/lib/types'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { withValidation } from '@/lib/validation-middleware'
import { PaginationSchema } from '@/lib/schemas/common'
import { auth } from '@/auth'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'
import { isAuthSecretConfigured } from '@/lib/auth-env'

const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/sessions']

async function applyRateLimit(request: NextRequest): Promise<{ response: NextResponse | null; headers: Headers }> {
  let userId: string | null = null
  if (isAuthSecretConfigured()) {
    try {
      const session = await auth()
      userId = session?.user?.id ?? null
    } catch {
      // Auth not available
    }
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

export const GET = withValidation(
  { query: PaginationSchema.partial() },
  async ({ query, request }) => {
    const versionInfo = getApiVersion(request)
    const { response: rateLimitResponse, headers } = await applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const sessions = await getSessions()
    
    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const offset = query.offset ?? (page - 1) * limit
    
    const paginatedSessions = sessions.slice(offset, offset + limit)
    
    const response = NextResponse.json({
      data: paginatedSessions,
      pagination: {
        page,
        limit,
        total: sessions.length,
        totalPages: Math.ceil(sessions.length / limit),
      },
      apiVersion: versionInfo.version,
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return addVersionHeaders(response, versionInfo)
  }
)

export const POST = withValidation(
  { body: SessionSchema },
  async ({ body, request }) => {
    const versionInfo = getApiVersion(request)
    const { response: rateLimitResponse, headers } = await applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const normalizedBody = SessionSchema.parse(body)
    await saveSession(normalizedBody)
    const response = NextResponse.json(normalizedBody, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return addVersionHeaders(response, versionInfo)
  }
)
