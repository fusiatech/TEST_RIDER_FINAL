import { NextRequest, NextResponse } from 'next/server'
import { getAuditLog } from '@/server/storage'
import { AuditLogFilterSchema } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { auth } from '@/auth'

const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/admin']

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageUsers')
  if (permissionError) return permissionError

  try {
    const { searchParams } = new URL(request.url)
    
    const filterInput: Record<string, unknown> = {}
    if (searchParams.has('userId')) filterInput.userId = searchParams.get('userId')
    if (searchParams.has('action')) filterInput.action = searchParams.get('action')
    if (searchParams.has('resourceType')) filterInput.resourceType = searchParams.get('resourceType')
    if (searchParams.has('startDate')) filterInput.startDate = searchParams.get('startDate')
    if (searchParams.has('endDate')) filterInput.endDate = searchParams.get('endDate')
    if (searchParams.has('limit')) filterInput.limit = parseInt(searchParams.get('limit') ?? '100', 10)
    if (searchParams.has('offset')) filterInput.offset = parseInt(searchParams.get('offset') ?? '0', 10)
    
    const filterResult = AuditLogFilterSchema.safeParse(filterInput)
    if (!filterResult.success) {
      return NextResponse.json(
        { error: `Invalid filter: ${filterResult.error.message}` },
        { status: 400 }
      )
    }
    
    const { entries, total } = await getAuditLog(filterResult.data)
    
    const response = NextResponse.json({
      entries,
      total,
      limit: filterResult.data.limit ?? 100,
      offset: filterResult.data.offset ?? 0,
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
