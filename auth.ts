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

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'user@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Demo credentials are explicitly disabled by default.
        if (!DEMO_AUTH_ENABLED) {
          return null
        }

        if (!DEMO_AUTH_EMAIL || !DEMO_AUTH_PASSWORD) {
          return null
        }

        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) {
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
    }),
  ],
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
      const isAuthRoute = request.nextUrl.pathname.startsWith('/api/auth')
      const isPublicApiRoute =
        request.nextUrl.pathname === '/api/metrics' ||
        request.nextUrl.pathname.startsWith('/api/health') ||
        request.nextUrl.pathname === '/api/eclipse/health'

      // Allow auth routes and public routes
      if (isAuthRoute || isPublicApiRoute) {
        return true
      }

      // Redirect logged-in users away from login page
      if (isOnLoginPage && isLoggedIn) {
        return Response.redirect(new URL('/', request.nextUrl))
      }

      // Allow login page for unauthenticated users
      if (isOnLoginPage) {
        return true
      }

      // Require auth for everything else
      return isLoggedIn
    },
  },
  trustHost: true,
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
