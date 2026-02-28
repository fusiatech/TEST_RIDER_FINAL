import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(async ({ req }: { req: NextRequest }) => {
    const cookie = req.headers.get('cookie') ?? ''
    return cookie.includes('valid-token') ? { sub: 'user-1' } : null
  }),
}))

import middleware from '@/middleware'

function buildRequest(url: string, cookie = ''): NextRequest {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : {},
  })
}

describe('middleware auth routing', () => {
  it('redirects unauthenticated root access to /login', async () => {
    const req = buildRequest('http://127.0.0.1:4100/')
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location).toBeTruthy()
    expect(location).toContain('/login')
    expect(location).toContain('callbackUrl=%2F')
  })

  it('returns 401 for unauthenticated protected API routes', async () => {
    const req = buildRequest('http://127.0.0.1:4100/api/jobs')
    const res = await middleware(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toMatchObject({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
    })
  })

  it('allows public health API routes without auth', async () => {
    const req = buildRequest('http://127.0.0.1:4100/api/health')
    const res = await middleware(req)
    expect(res.status).toBe(200)
  })

  it('redirects authenticated users from /login to /', async () => {
    const req = buildRequest(
      'http://127.0.0.1:4100/login',
      'next-auth.session-token=valid-token'
    )
    const res = await middleware(req)
    expect(res.status).toBe(307)
    const location = res.headers.get('location')
    expect(location === 'http://127.0.0.1:4100/' || location === 'http://localhost:4100/').toBe(true)
  })
})
