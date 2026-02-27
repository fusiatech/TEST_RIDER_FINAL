import { NextRequest, NextResponse } from 'next/server'
import { getUsers, saveUser, getUserByEmail } from '@/server/storage'
import { UserSchema, UserRoleSchema, type User } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { auth } from '@/auth'
import { z } from 'zod'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'

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
    const users = await getUsers()
    const response = NextResponse.json(users)
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: UserRoleSchema,
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageUsers')
  if (permissionError) return permissionError

  try {
    const body: unknown = await request.json()
    const result = CreateUserSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid user data: ${result.error.message}` },
        { status: 400 }
      )
    }

    const existing = await getUserByEmail(result.data.email)
    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    const now = Date.now()
    const user: User = {
      id: crypto.randomUUID(),
      email: result.data.email,
      name: result.data.name,
      role: result.data.role,
      createdAt: now,
      updatedAt: now,
    }

    await saveUser(user)
    const response = NextResponse.json(user, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
