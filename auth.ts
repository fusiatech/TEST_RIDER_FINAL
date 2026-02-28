import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import type { NextAuthConfig, User, Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import type { UserRole, AuditLogEntry } from '@/lib/types'

async function logAuditEntryAsync(entry: AuditLogEntry): Promise<void> {
  if (typeof window !== 'undefined') return
  try {
    const { logAuditEntry } = await import('@/server/storage')
    await logAuditEntry(entry)
  } catch (err) {
    console.error('[auth] Failed to log audit entry:', err)
  }
}

declare module 'next-auth' {
  interface User {
    role?: UserRole
  }
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      role: UserRole
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole
  }
}

const DEMO_AUTH_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.ENABLE_DEMO_AUTH === 'true'
const DEMO_AUTH_EMAIL = process.env.DEMO_AUTH_EMAIL
const DEMO_AUTH_PASSWORD = process.env.DEMO_AUTH_PASSWORD
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean)

function buildAuthProviders(): NonNullable<NextAuthConfig['providers']> {
  const providers: NonNullable<NextAuthConfig['providers']> = []

  const githubId = process.env.GITHUB_ID
  const githubSecret = process.env.GITHUB_SECRET
  if (githubId && githubSecret) {
    providers.push(
      GitHub({
        clientId: githubId,
        clientSecret: githubSecret,
      })
    )
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (googleClientId && googleClientSecret) {
    providers.push(
      Google({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      })
    )
  }

  providers.push(
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'user@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim().toLowerCase()
        const password = credentials?.password as string | undefined
        if (!email || !password) {
          return null
        }

        // Primary path: registered local user credentials.
        const { getUserByEmail, getUserPasswordHash } = await import('@/server/storage')
        const { verifyPassword } = await import('@/lib/password')
        const existingUser = await getUserByEmail(email)
        if (existingUser) {
          const passwordHash = await getUserPasswordHash(existingUser.id)
          if (passwordHash && verifyPassword(password, passwordHash)) {
            return {
              id: existingUser.id,
              email: existingUser.email,
              name: existingUser.name ?? existingUser.email.split('@')[0],
              role: existingUser.role,
            }
          }
        }

        // Demo credentials are explicitly disabled by default.
        if (!DEMO_AUTH_ENABLED) {
          return null
        }

        if (!DEMO_AUTH_EMAIL || !DEMO_AUTH_PASSWORD) {
          return null
        }

        if (email === DEMO_AUTH_EMAIL && password === DEMO_AUTH_PASSWORD) {
          const isAdmin = ADMIN_EMAILS.includes(email)
          return {
            id: 'demo-user',
            email: DEMO_AUTH_EMAIL,
            name: 'Demo User',
            role: isAdmin ? 'admin' : 'editor',
          }
        }

        return null
      },
    })
  )

  return providers
}

export const authConfig: NextAuthConfig = {
  providers: buildAuthProviders(),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  events: {
    async signIn({ user, account }) {
      const entry: AuditLogEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date().toISOString(),
        userId: user.id ?? 'unknown',
        userEmail: user.email ?? 'unknown',
        action: 'user_login',
        resourceType: 'user',
        resourceId: user.id,
        details: { provider: account?.provider ?? 'unknown' },
      }
      await logAuditEntryAsync(entry)
    },
    async signOut(message) {
      const token = 'token' in message ? message.token : null
      const entry: AuditLogEntry = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: new Date().toISOString(),
        userId: (token?.id as string) ?? 'unknown',
        userEmail: (token?.email as string) ?? 'unknown',
        action: 'user_logout',
        resourceType: 'user',
        resourceId: (token?.id as string) ?? undefined,
      }
      await logAuditEntryAsync(entry)
    },
  },
  callbacks: {
    async jwt({ token, user, account }: { token: JWT; user?: User; account?: { provider: string } | null }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        const email = user.email ?? ''
        const isAdmin = ADMIN_EMAILS.includes(email)
        token.role = user.role ?? (isAdmin ? 'admin' : 'editor')
      }
      if (account) {
        token.provider = account.provider
      }
      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.role = (token.role as UserRole) ?? 'editor'
      }
      return session
    },
    async authorized({ auth, request }: { auth: Session | null; request: NextRequest }) {
      const isLoggedIn = !!auth?.user
      const isOnLoginPage = request.nextUrl.pathname.startsWith('/login')
      const isOnRegisterPage = request.nextUrl.pathname.startsWith('/register')
      const isAuthRoute = request.nextUrl.pathname.startsWith('/api/auth')
      const isPublicApiRoute =
        request.nextUrl.pathname === '/api/metrics' ||
        request.nextUrl.pathname.startsWith('/api/health') ||
        request.nextUrl.pathname === '/api/eclipse/health'

      // Allow auth routes and public routes
      if (isAuthRoute || isPublicApiRoute) {
        return true
      }

      // Allow login/register pages for unauthenticated users
      if (isOnLoginPage || isOnRegisterPage) {
        return true
      }

      // Require auth for everything else
      return isLoggedIn
    },
  },
  trustHost: true,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
