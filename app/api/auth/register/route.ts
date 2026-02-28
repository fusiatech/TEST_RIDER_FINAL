import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserByEmail, saveUser, saveUserPasswordHash } from '@/server/storage'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { hashPassword } from '@/lib/password'
import { auditUserRegister } from '@/lib/audit'
import type { User } from '@/lib/types'

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100).optional(),
})

const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/sessions']

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { success, headers, ipResult, userResult } = await checkDualRateLimit(request, RATE_LIMIT_CONFIG, null)
  if (!success) {
    const effectiveResult = userResult && !userResult.success ? userResult : ipResult
    return new NextResponse(
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
      },
    )
  }

  try {
    const parsed = RegisterSchema.safeParse(await request.json())
    if (!parsed.success) {
      const response = NextResponse.json({ error: 'Invalid registration payload' }, { status: 400 })
      headers.forEach((value, key) => response.headers.set(key, value))
      return response
    }

    const email = parsed.data.email.trim().toLowerCase()
    const existing = await getUserByEmail(email)
    if (existing) {
      const response = NextResponse.json({ error: 'Email already registered' }, { status: 409 })
      headers.forEach((value, key) => response.headers.set(key, value))
      return response
    }

    const now = Date.now()
    const user: User = {
      id: crypto.randomUUID(),
      email,
      name: parsed.data.name?.trim() || email.split('@')[0],
      role: 'editor',
      createdAt: now,
      updatedAt: now,
    }

    await saveUser(user)
    await saveUserPasswordHash(user.id, hashPassword(parsed.data.password))
    await auditUserRegister(user.id, user.email)

    const response = NextResponse.json({ success: true, userId: user.id }, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const response = NextResponse.json({ error: message }, { status: 500 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  }
}
