import type { IncomingMessage } from 'node:http'
import { decode } from 'next-auth/jwt'
import type { JWT } from 'next-auth/jwt'
import type { UserRole } from '@/lib/types'
import { createLogger } from '@/server/logger'
import { getEffectiveAuthSecret } from '@/lib/auth-env'

const logger = createLogger('ws-auth')

export interface WSAuthenticatedUser {
  id: string
  email: string
  name?: string | null
  role: UserRole
}

export interface WSAuthResult {
  authenticated: boolean
  user?: WSAuthenticatedUser
  error?: string
}

let loggedMissingSecretWarning = false

const SENSITIVE_MESSAGE_TYPES = new Set([
  'start-swarm',
  'cancel-swarm',
  'cancel-job',
  'pause-job',
  'resume-job',
  'cancel-all-queued',
  'emergency-stop',
  'mcp-tool-call',
  'watch-project',
  'unwatch-project',
])

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null
  
  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=')
    if (key.trim() === name) {
      return valueParts.join('=')
    }
  }
  return null
}

function getTokenFromRequest(req: IncomingMessage): string | null {
  const cookieHeader = req.headers.cookie
  
  let token = getCookieValue(cookieHeader, 'authjs.session-token')
  if (token) return token
  
  token = getCookieValue(cookieHeader, '__Secure-authjs.session-token')
  if (token) return token
  
  token = getCookieValue(cookieHeader, 'next-auth.session-token')
  if (token) return token
  
  token = getCookieValue(cookieHeader, '__Secure-next-auth.session-token')
  if (token) return token
  
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  token = url.searchParams.get('token')
  if (token) return token
  
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  
  return null
}

export async function authenticateWSConnection(req: IncomingMessage): Promise<WSAuthResult> {
  const authSecret = getEffectiveAuthSecret()

  if (!authSecret) {
    if (!loggedMissingSecretWarning) {
      logger.warn('No AUTH_SECRET/NEXTAUTH_SECRET configured - WebSocket auth disabled')
      loggedMissingSecretWarning = true
    }
    return {
      authenticated: false,
      error: 'Missing auth secret; cannot verify websocket session token',
    }
  }

  const token = getTokenFromRequest(req)
  
  if (!token) {
    logger.debug('No session token found in WebSocket upgrade request')
    return {
      authenticated: false,
      error: 'No authentication token provided',
    }
  }

  try {
    const decoded = await decode({
      token,
      secret: authSecret,
      salt: 'authjs.session-token',
    }) as JWT | null

    if (!decoded) {
      const decodedAlt = await decode({
        token,
        secret: authSecret,
        salt: 'next-auth.session-token',
      }) as JWT | null
      
      if (!decodedAlt) {
        logger.debug('Failed to decode JWT token')
        return {
          authenticated: false,
          error: 'Invalid or expired token',
        }
      }
      
      return extractUserFromToken(decodedAlt)
    }

    return extractUserFromToken(decoded)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('JWT verification failed', { error: message })
    return {
      authenticated: false,
      error: 'Token verification failed',
    }
  }
}

function extractUserFromToken(token: JWT): WSAuthResult {
  const userId = (token.id as string) || (token.sub as string)
  const email = token.email as string
  
  if (!userId || !email) {
    logger.debug('Token missing required fields', { hasId: !!userId, hasEmail: !!email })
    return {
      authenticated: false,
      error: 'Invalid token payload',
    }
  }

  return {
    authenticated: true,
    user: {
      id: userId,
      email,
      name: token.name as string | null,
      role: (token.role as UserRole) || 'viewer',
    },
  }
}

export function isSensitiveOperation(messageType: string): boolean {
  return SENSITIVE_MESSAGE_TYPES.has(messageType)
}

export function canPerformOperation(user: WSAuthenticatedUser, messageType: string): boolean {
  if (!isSensitiveOperation(messageType)) {
    return true
  }

  if (user.role === 'viewer') {
    return false
  }

  return true
}

export function getRequiredRoleForOperation(messageType: string): UserRole {
  switch (messageType) {
    case 'start-swarm':
    case 'cancel-swarm':
    case 'cancel-job':
    case 'pause-job':
    case 'resume-job':
    case 'cancel-all-queued':
    case 'emergency-stop':
    case 'mcp-tool-call':
    case 'watch-project':
    case 'unwatch-project':
      return 'editor'
    default:
      return 'viewer'
  }
}
