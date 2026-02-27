import { NextRequest, NextResponse } from 'next/server'
import { getTenants, createTenant, getTenantBySlug } from '@/server/storage'
import { TenantSchema, type Tenant } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { z } from 'zod'
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
    const tenants = await getTenants()
    const response = NextResponse.json(tenants)
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const CreateTenantSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(
    /^[a-z0-9-]+$/,
    'Slug must contain only lowercase letters, numbers, and hyphens'
  ),
  ownerId: z.string().min(1, 'Owner ID is required'),
  settings: z.object({
    maxUsers: z.number().min(1).default(10),
    maxProjects: z.number().min(1).default(50),
    maxStorage: z.number().min(1).default(1073741824),
  }).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageUsers')
  if (permissionError) return permissionError

  try {
    const body: unknown = await request.json()
    const result = CreateTenantSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid tenant data: ${result.error.message}` },
        { status: 400 }
      )
    }

    const existingSlug = await getTenantBySlug(result.data.slug)
    if (existingSlug) {
      return NextResponse.json(
        { error: 'Tenant with this slug already exists' },
        { status: 409 }
      )
    }

    const tenant = await createTenant({
      name: result.data.name,
      slug: result.data.slug,
      ownerId: result.data.ownerId,
      settings: result.data.settings,
    })

    const response = NextResponse.json(tenant, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
