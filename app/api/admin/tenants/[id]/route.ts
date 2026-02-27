import { NextRequest, NextResponse } from 'next/server'
import { getTenant, updateTenant, deleteTenant, getTenantUsers } from '@/server/storage'
import { TenantSettingsSchema } from '@/lib/types'
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageUsers')
  if (permissionError) return permissionError

  try {
    const { id } = await params
    const tenant = await getTenant(id)
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }
    
    const users = await getTenantUsers(id)
    
    const response = NextResponse.json({
      ...tenant,
      userCount: users.length,
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(
    /^[a-z0-9-]+$/,
    'Slug must contain only lowercase letters, numbers, and hyphens'
  ).optional(),
  ownerId: z.string().min(1).optional(),
  settings: TenantSettingsSchema.optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageUsers')
  if (permissionError) return permissionError

  try {
    const { id } = await params
    const body: unknown = await request.json()
    const result = UpdateTenantSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update data: ${result.error.message}` },
        { status: 400 }
      )
    }

    const updated = await updateTenant(id, result.data)
    if (!updated) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const response = NextResponse.json(updated)
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageUsers')
  if (permissionError) return permissionError

  try {
    const { id } = await params
    
    const users = await getTenantUsers(id)
    if (users.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete tenant with assigned users. Remove all users first.' },
        { status: 400 }
      )
    }
    
    const deleted = await deleteTenant(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }
    
    const response = NextResponse.json({ success: true })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
