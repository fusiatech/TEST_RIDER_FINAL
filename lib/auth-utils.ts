import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

/**
 * Get the current session on the server side
 * Use this in Server Components and API routes
 */
export async function getServerSession(): Promise<Session | null> {
  return await auth()
}

/**
 * Require authentication for API routes
 * Returns the session if authenticated, or a 401 response if not
 *
 * @example
 * export async function GET() {
 *   const authResult = await requireAuth()
 *   if (authResult instanceof NextResponse) return authResult
 *   const session = authResult
 *   // ... rest of handler
 * }
 */
export async function requireAuth(): Promise<Session | NextResponse> {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    )
  }

  return session
}

/**
 * Check if the current user has a specific role
 * Extend this based on your role system
 */
export async function hasRole(role: string): Promise<boolean> {
  const session = await auth()
  if (!session?.user) return false

  // Extend this with your role checking logic
  // For now, all authenticated users have 'user' role
  if (role === 'user') return true

  // Add admin check based on email or database lookup
  if (role === 'admin') {
    return session.user.email === 'admin@swarmui.local'
  }

  return false
}

/**
 * Get the current user's ID
 * Returns null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

/**
 * Get the current user's email
 * Returns null if not authenticated
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  const session = await auth()
  return session?.user?.email ?? null
}
