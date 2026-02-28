import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
}

export async function requireAuthenticatedUser(): Promise<{ user: AuthenticatedUser } | { response: NextResponse }> {
  const session = await auth().catch(() => null)
  const id = session?.user?.id
  const email = session?.user?.email
  if (!id || !email) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return {
    user: {
      id,
      email,
      name: session.user.name,
    },
  }
}

export function featureDisabledResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      error: 'FeatureDisabled',
      message,
    },
    { status: 503 }
  )
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}
