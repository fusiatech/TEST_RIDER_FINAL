import { NextRequest, NextResponse } from 'next/server'
import { getProjects, saveProject } from '@/server/storage'
import { ProjectSchema } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { auditProjectCreate } from '@/lib/audit'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { auth } from '@/auth'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/projects']

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
  const versionInfo = getApiVersion(request)
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const projects = await getProjects()
    const response = NextResponse.json({
      data: projects,
      apiVersion: versionInfo.version,
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const versionInfo = getApiVersion(request)
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canCreateProjects')
  if (permissionError) return permissionError

  try {
    const body: unknown = await request.json()
    const result = ProjectSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid project: ${result.error.message}` },
        { status: 400 }
      )
    }
    await saveProject(result.data)
    await auditProjectCreate(result.data.id, result.data.name)
    const response = NextResponse.json(result.data, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
