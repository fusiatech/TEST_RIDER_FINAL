import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'

const CSRF_TOKEN_HEADER = 'x-csrf-token'
const CSRF_COOKIE_NAME = '__Host-csrf-token'
const TOKEN_LENGTH = 32
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const SKIP_CSRF_PATHS = new Set([
  '/api/auth',
  '/api/health',
  '/api/health/live',
  '/api/health/ready',
  '/api/metrics',
  '/api/openapi',
  '/api/cli-detect',
])

const SKIP_CSRF_PATH_PREFIXES = [
  '/api/auth/',
]

type RouteHandler = (
  request: NextRequest,
  context?: { params?: Promise<Record<string, string>> }
) => Promise<NextResponse> | NextResponse

export interface CsrfToken {
  token: string
  timestamp: number
}

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex')
}

/**
 * Create a signed CSRF token with timestamp
 */
export function createSignedToken(secret: string): string {
  const token = generateCsrfToken()
  const timestamp = Date.now()
  const payload = `${token}.${timestamp}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return `${payload}.${signature}`
}

/**
 * Verify a signed CSRF token
 */
export function verifySignedToken(signedToken: string, secret: string): boolean {
  const parts = signedToken.split('.')
  if (parts.length !== 3) return false

  const [token, timestampStr, signature] = parts
  const timestamp = parseInt(timestampStr, 10)

  if (isNaN(timestamp)) return false
  if (Date.now() - timestamp > TOKEN_TTL_MS) return false

  const payload = `${token}.${timestampStr}`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}

/**
 * Get the CSRF secret from environment
 */
export function getCsrfSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.CSRF_SECRET
  if (!secret) {
    console.warn('[csrf] No CSRF_SECRET or NEXTAUTH_SECRET set, using fallback (not secure for production)')
    return 'swarm-ui-default-csrf-secret-change-me'
  }
  return secret
}

/**
 * Check if a path should skip CSRF validation
 */
export function shouldSkipCsrf(pathname: string): boolean {
  if (SKIP_CSRF_PATHS.has(pathname)) return true
  
  for (const prefix of SKIP_CSRF_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
  }
  
  return false
}

/**
 * Validate CSRF token from request
 */
export function validateCsrfToken(request: NextRequest): { valid: boolean; error?: string } {
  const method = request.method.toUpperCase()
  
  if (SAFE_METHODS.has(method)) {
    return { valid: true }
  }

  const pathname = new URL(request.url).pathname
  if (shouldSkipCsrf(pathname)) {
    return { valid: true }
  }

  const headerToken = request.headers.get(CSRF_TOKEN_HEADER)
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

  if (!headerToken) {
    return { valid: false, error: 'Missing CSRF token in header' }
  }

  if (!cookieToken) {
    return { valid: false, error: 'Missing CSRF token cookie' }
  }

  const secret = getCsrfSecret()

  if (!verifySignedToken(headerToken, secret)) {
    return { valid: false, error: 'Invalid or expired CSRF token' }
  }

  if (headerToken !== cookieToken) {
    return { valid: false, error: 'CSRF token mismatch' }
  }

  return { valid: true }
}

/**
 * CSRF protection middleware wrapper for route handlers
 */
export function withCsrfProtection(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const validation = validateCsrfToken(request)

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'CSRF Validation Failed',
          message: validation.error,
        },
        { status: 403 }
      )
    }

    return handler(request, context)
  }
}

/**
 * Create CSRF-protected route handlers
 */
export function createCsrfProtectedHandler(
  handlers: {
    GET?: RouteHandler
    POST?: RouteHandler
    PUT?: RouteHandler
    DELETE?: RouteHandler
    PATCH?: RouteHandler
  }
): {
  GET?: RouteHandler
  POST?: RouteHandler
  PUT?: RouteHandler
  DELETE?: RouteHandler
  PATCH?: RouteHandler
} {
  const wrapped: typeof handlers = {}

  for (const [method, handler] of Object.entries(handlers)) {
    if (handler) {
      if (SAFE_METHODS.has(method)) {
        wrapped[method as keyof typeof handlers] = handler
      } else {
        wrapped[method as keyof typeof handlers] = withCsrfProtection(handler)
      }
    }
  }

  return wrapped
}

/**
 * Generate a new CSRF token and create response headers/cookies
 */
export function generateCsrfResponse(): {
  token: string
  headers: Headers
} {
  const secret = getCsrfSecret()
  const token = createSignedToken(secret)
  
  const headers = new Headers()
  headers.set(
    'Set-Cookie',
    `${CSRF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${TOKEN_TTL_MS / 1000}`
  )
  headers.set(CSRF_TOKEN_HEADER, token)

  return { token, headers }
}

/**
 * API endpoint handler to get a new CSRF token
 * Use this in a GET /api/csrf route
 */
export async function getCsrfTokenHandler(): Promise<NextResponse> {
  const { token, headers } = generateCsrfResponse()
  
  return new NextResponse(
    JSON.stringify({ csrfToken: token }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(headers.entries()),
      },
    }
  )
}

export {
  CSRF_TOKEN_HEADER,
  CSRF_COOKIE_NAME,
  SAFE_METHODS,
  SKIP_CSRF_PATHS,
}
