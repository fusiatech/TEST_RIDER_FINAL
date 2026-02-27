import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes, createHmac } from 'node:crypto'

/**
 * CSRF Protection Tests
 * Tests for Cross-Site Request Forgery token generation, validation, and protection
 */

interface CSRFToken {
  token: string
  timestamp: number
  sessionId: string
}

interface CSRFConfig {
  secret: string
  tokenLifetimeMs: number
  cookieName: string
  headerName: string
}

const DEFAULT_CONFIG: CSRFConfig = {
  secret: 'test-secret-key-for-csrf-protection',
  tokenLifetimeMs: 3600000,
  cookieName: 'csrf-token',
  headerName: 'X-CSRF-Token',
}

function generateCSRFToken(sessionId: string, config: CSRFConfig = DEFAULT_CONFIG): string {
  const timestamp = Date.now()
  const random = randomBytes(16).toString('hex')
  const payload = `${sessionId}:${timestamp}:${random}`
  const signature = createHmac('sha256', config.secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${signature}`).toString('base64')
}

function validateCSRFToken(
  token: string,
  sessionId: string,
  config: CSRFConfig = DEFAULT_CONFIG
): { valid: boolean; error?: string } {
  if (!token) {
    return { valid: false, error: 'Token is required' }
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const parts = decoded.split(':')
    
    if (parts.length !== 4) {
      return { valid: false, error: 'Invalid token format' }
    }

    const [tokenSessionId, timestampStr, random, providedSignature] = parts
    const timestamp = parseInt(timestampStr, 10)

    if (tokenSessionId !== sessionId) {
      return { valid: false, error: 'Session mismatch' }
    }

    if (Date.now() - timestamp > config.tokenLifetimeMs) {
      return { valid: false, error: 'Token expired' }
    }

    const payload = `${tokenSessionId}:${timestamp}:${random}`
    const expectedSignature = createHmac('sha256', config.secret).update(payload).digest('hex')

    if (providedSignature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Token parsing failed' }
  }
}

function extractCSRFFromCookie(cookieHeader: string, cookieName: string): string | null {
  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const [name, value] = cookie.split('=')
    if (name === cookieName) {
      return value
    }
  }
  return null
}

describe('CSRF Protection Tests', () => {
  describe('Token Generation', () => {
    it('generates a valid base64-encoded token', () => {
      const sessionId = 'test-session-123'
      const token = generateCSRFToken(sessionId)
      
      expect(token).toBeTruthy()
      expect(() => Buffer.from(token, 'base64').toString('utf-8')).not.toThrow()
    })

    it('generates unique tokens for each call', () => {
      const sessionId = 'test-session-123'
      const token1 = generateCSRFToken(sessionId)
      const token2 = generateCSRFToken(sessionId)
      
      expect(token1).not.toBe(token2)
    })

    it('includes session ID in token payload', () => {
      const sessionId = 'unique-session-456'
      const token = generateCSRFToken(sessionId)
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      
      expect(decoded).toContain(sessionId)
    })

    it('includes timestamp in token payload', () => {
      const sessionId = 'test-session-123'
      const beforeTime = Date.now()
      const token = generateCSRFToken(sessionId)
      const afterTime = Date.now()
      
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const parts = decoded.split(':')
      const timestamp = parseInt(parts[1], 10)
      
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('generates cryptographically random component', () => {
      const sessionId = 'test-session-123'
      const tokens = new Set<string>()
      
      for (let i = 0; i < 100; i++) {
        const token = generateCSRFToken(sessionId)
        const decoded = Buffer.from(token, 'base64').toString('utf-8')
        const random = decoded.split(':')[2]
        tokens.add(random)
      }
      
      expect(tokens.size).toBe(100)
    })

    it('uses HMAC-SHA256 for signature', () => {
      const sessionId = 'test-session-123'
      const token = generateCSRFToken(sessionId)
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const signature = decoded.split(':')[3]
      
      expect(signature).toHaveLength(64)
    })
  })

  describe('Token Validation', () => {
    it('validates a correctly generated token', () => {
      const sessionId = 'test-session-123'
      const token = generateCSRFToken(sessionId)
      
      const result = validateCSRFToken(token, sessionId)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects empty token', () => {
      const result = validateCSRFToken('', 'test-session')
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token is required')
    })

    it('rejects malformed token', () => {
      const result = validateCSRFToken('not-valid-base64!@#$', 'test-session')
      
      expect(result.valid).toBe(false)
    })

    it('rejects token with wrong session ID', () => {
      const token = generateCSRFToken('session-1')
      const result = validateCSRFToken(token, 'session-2')
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Session mismatch')
    })

    it('rejects expired token', () => {
      const sessionId = 'test-session-123'
      const config: CSRFConfig = {
        ...DEFAULT_CONFIG,
        tokenLifetimeMs: 1,
      }
      
      const token = generateCSRFToken(sessionId, config)
      
      return new Promise<void>(resolve => {
        setTimeout(() => {
          const result = validateCSRFToken(token, sessionId, config)
          expect(result.valid).toBe(false)
          expect(result.error).toBe('Token expired')
          resolve()
        }, 10)
      })
    })

    it('rejects token with tampered signature', () => {
      const sessionId = 'test-session-123'
      const token = generateCSRFToken(sessionId)
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const parts = decoded.split(':')
      parts[3] = 'tampered' + parts[3].slice(8)
      const tamperedToken = Buffer.from(parts.join(':')).toString('base64')
      
      const result = validateCSRFToken(tamperedToken, sessionId)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid signature')
    })

    it('rejects token with tampered timestamp', () => {
      const sessionId = 'test-session-123'
      const token = generateCSRFToken(sessionId)
      const decoded = Buffer.from(token, 'base64').toString('utf-8')
      const parts = decoded.split(':')
      parts[1] = String(Date.now() + 1000000)
      const tamperedToken = Buffer.from(parts.join(':')).toString('base64')
      
      const result = validateCSRFToken(tamperedToken, sessionId)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid signature')
    })

    it('rejects token with wrong format', () => {
      const badToken = Buffer.from('only:two:parts').toString('base64')
      const result = validateCSRFToken(badToken, 'test-session')
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid token format')
    })
  })

  describe('CSRF Protection on Routes', () => {
    const mockRequest = (method: string, headers: Record<string, string> = {}, cookies: string = '') => ({
      method,
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
        ...headers,
      },
      cookies: {
        get: (name: string) => {
          const match = cookies.match(new RegExp(`${name}=([^;]+)`))
          return match ? { value: match[1] } : null
        },
      },
    })

    function checkCSRFProtection(
      request: ReturnType<typeof mockRequest>,
      sessionId: string,
      config: CSRFConfig = DEFAULT_CONFIG
    ): { allowed: boolean; error?: string } {
      const safeMethods = ['GET', 'HEAD', 'OPTIONS']
      if (safeMethods.includes(request.method.toUpperCase())) {
        return { allowed: true }
      }

      const headerToken = request.headers.get(config.headerName)
      const cookieToken = extractCSRFFromCookie(
        request.headers.get('cookie') ?? '',
        config.cookieName
      )

      if (!headerToken) {
        return { allowed: false, error: 'CSRF token header missing' }
      }

      if (!cookieToken) {
        return { allowed: false, error: 'CSRF token cookie missing' }
      }

      if (headerToken !== cookieToken) {
        return { allowed: false, error: 'CSRF token mismatch' }
      }

      const validation = validateCSRFToken(headerToken, sessionId, config)
      if (!validation.valid) {
        return { allowed: false, error: validation.error }
      }

      return { allowed: true }
    }

    it('allows GET requests without CSRF token', () => {
      const request = mockRequest('GET')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(true)
    })

    it('allows HEAD requests without CSRF token', () => {
      const request = mockRequest('HEAD')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(true)
    })

    it('allows OPTIONS requests without CSRF token', () => {
      const request = mockRequest('OPTIONS')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(true)
    })

    it('blocks POST requests without CSRF token', () => {
      const request = mockRequest('POST')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(false)
      expect(result.error).toBe('CSRF token header missing')
    })

    it('blocks PUT requests without CSRF token', () => {
      const request = mockRequest('PUT')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(false)
    })

    it('blocks DELETE requests without CSRF token', () => {
      const request = mockRequest('DELETE')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(false)
    })

    it('blocks PATCH requests without CSRF token', () => {
      const request = mockRequest('PATCH')
      const result = checkCSRFProtection(request, 'session-123')
      
      expect(result.allowed).toBe(false)
    })

    it('allows POST with valid CSRF token in header and cookie', () => {
      const sessionId = 'session-123'
      const token = generateCSRFToken(sessionId)
      const request = mockRequest(
        'POST',
        { 'x-csrf-token': token, 'cookie': `csrf-token=${token}` },
        `csrf-token=${token}`
      )
      
      const result = checkCSRFProtection(request, sessionId)
      expect(result.allowed).toBe(true)
    })

    it('blocks POST when header token missing', () => {
      const sessionId = 'session-123'
      const token = generateCSRFToken(sessionId)
      const request = mockRequest('POST', { 'cookie': `csrf-token=${token}` })
      
      const result = checkCSRFProtection(request, sessionId)
      expect(result.allowed).toBe(false)
      expect(result.error).toBe('CSRF token header missing')
    })

    it('blocks POST when cookie token missing', () => {
      const sessionId = 'session-123'
      const token = generateCSRFToken(sessionId)
      const request = mockRequest('POST', { 'x-csrf-token': token })
      
      const result = checkCSRFProtection(request, sessionId)
      expect(result.allowed).toBe(false)
      expect(result.error).toBe('CSRF token cookie missing')
    })

    it('blocks POST when header and cookie tokens mismatch', () => {
      const sessionId = 'session-123'
      const headerToken = generateCSRFToken(sessionId)
      const cookieToken = generateCSRFToken(sessionId)
      const request = mockRequest(
        'POST',
        { 'x-csrf-token': headerToken, 'cookie': `csrf-token=${cookieToken}` },
        `csrf-token=${cookieToken}`
      )
      
      const result = checkCSRFProtection(request, sessionId)
      expect(result.allowed).toBe(false)
      expect(result.error).toBe('CSRF token mismatch')
    })
  })

  describe('CSRF Bypass Attempts', () => {
    it('rejects token from different origin (simulated)', () => {
      const attackerSessionId = 'attacker-session'
      const victimSessionId = 'victim-session'
      const attackerToken = generateCSRFToken(attackerSessionId)
      
      const result = validateCSRFToken(attackerToken, victimSessionId)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Session mismatch')
    })

    it('rejects replayed old token', () => {
      const sessionId = 'test-session'
      const config: CSRFConfig = {
        ...DEFAULT_CONFIG,
        tokenLifetimeMs: 50,
      }
      
      const token = generateCSRFToken(sessionId, config)
      
      return new Promise<void>(resolve => {
        setTimeout(() => {
          const result = validateCSRFToken(token, sessionId, config)
          expect(result.valid).toBe(false)
          expect(result.error).toBe('Token expired')
          resolve()
        }, 100)
      })
    })

    it('rejects token with null bytes injection', () => {
      const sessionId = 'test-session'
      const token = generateCSRFToken(sessionId)
      const injectedToken = token + '\x00malicious'
      
      const result = validateCSRFToken(injectedToken, sessionId)
      expect(result.valid).toBe(false)
    })

    it('rejects token with unicode normalization attack', () => {
      const sessionId = 'test-session'
      const token = generateCSRFToken(sessionId)
      const unicodeToken = token.replace('a', '\u0061\u0301')
      
      const result = validateCSRFToken(unicodeToken, sessionId)
      expect(result.valid).toBe(false)
    })

    it('rejects token with base64 padding manipulation', () => {
      const sessionId = 'test-session'
      const token = generateCSRFToken(sessionId)
      const paddingManipulated = token.replace(/=+$/, '') + '==='
      
      const result = validateCSRFToken(paddingManipulated, sessionId)
      expect(result.valid).toBe(false)
    })

    it('rejects token with URL encoding bypass', () => {
      const sessionId = 'test-session'
      const token = generateCSRFToken(sessionId)
      const urlEncoded = encodeURIComponent(token)
      
      const result = validateCSRFToken(urlEncoded, sessionId)
      expect(result.valid).toBe(false)
    })

    it('rejects token with double encoding', () => {
      const sessionId = 'test-session'
      const token = generateCSRFToken(sessionId)
      const doubleEncoded = encodeURIComponent(encodeURIComponent(token))
      
      const result = validateCSRFToken(doubleEncoded, sessionId)
      expect(result.valid).toBe(false)
    })

    it('rejects token with case manipulation', () => {
      const sessionId = 'test-session'
      const token = generateCSRFToken(sessionId)
      const caseManipulated = token.toUpperCase()
      
      const result = validateCSRFToken(caseManipulated, sessionId)
      expect(result.valid).toBe(false)
    })

    it('rejects empty string as token', () => {
      const result = validateCSRFToken('', 'test-session')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Token is required')
    })

    it('rejects whitespace-only token', () => {
      const result = validateCSRFToken('   ', 'test-session')
      expect(result.valid).toBe(false)
    })

    it('rejects token with only base64 characters but invalid structure', () => {
      const fakeToken = Buffer.from('fake:token').toString('base64')
      const result = validateCSRFToken(fakeToken, 'test-session')
      expect(result.valid).toBe(false)
    })

    it('handles very long tokens gracefully', () => {
      const longToken = 'A'.repeat(10000)
      const result = validateCSRFToken(longToken, 'test-session')
      expect(result.valid).toBe(false)
    })

    it('handles special characters in session ID', () => {
      const sessionId = 'session<script>alert(1)</script>'
      const token = generateCSRFToken(sessionId)
      
      const result = validateCSRFToken(token, sessionId)
      expect(result.valid).toBe(true)
    })
  })

  describe('Cookie Security Attributes', () => {
    function generateSecureCookieHeader(
      token: string,
      options: {
        httpOnly?: boolean
        secure?: boolean
        sameSite?: 'Strict' | 'Lax' | 'None'
        path?: string
        maxAge?: number
      } = {}
    ): string {
      const parts = [`csrf-token=${token}`]
      
      if (options.httpOnly !== false) parts.push('HttpOnly')
      if (options.secure !== false) parts.push('Secure')
      if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
      if (options.path) parts.push(`Path=${options.path}`)
      if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`)
      
      return parts.join('; ')
    }

    it('generates cookie with HttpOnly flag', () => {
      const token = generateCSRFToken('session-123')
      const cookie = generateSecureCookieHeader(token, { httpOnly: true })
      
      expect(cookie).toContain('HttpOnly')
    })

    it('generates cookie with Secure flag', () => {
      const token = generateCSRFToken('session-123')
      const cookie = generateSecureCookieHeader(token, { secure: true })
      
      expect(cookie).toContain('Secure')
    })

    it('generates cookie with SameSite=Strict', () => {
      const token = generateCSRFToken('session-123')
      const cookie = generateSecureCookieHeader(token, { sameSite: 'Strict' })
      
      expect(cookie).toContain('SameSite=Strict')
    })

    it('generates cookie with SameSite=Lax', () => {
      const token = generateCSRFToken('session-123')
      const cookie = generateSecureCookieHeader(token, { sameSite: 'Lax' })
      
      expect(cookie).toContain('SameSite=Lax')
    })

    it('generates cookie with path restriction', () => {
      const token = generateCSRFToken('session-123')
      const cookie = generateSecureCookieHeader(token, { path: '/api' })
      
      expect(cookie).toContain('Path=/api')
    })

    it('generates cookie with max-age', () => {
      const token = generateCSRFToken('session-123')
      const cookie = generateSecureCookieHeader(token, { maxAge: 3600 })
      
      expect(cookie).toContain('Max-Age=3600')
    })
  })
})
