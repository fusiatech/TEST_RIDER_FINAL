import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

// Create a mock function for auth
const mockAuth = vi.fn()

// Mock the auth module before importing auth-utils
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}))

import {
  getServerSession,
  requireAuth,
  hasRole,
  getCurrentUserId,
  getCurrentUserEmail,
} from '@/lib/auth-utils'

describe('auth-utils.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getServerSession', () => {
    it('returns session when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const session = await getServerSession()

      expect(session).toEqual(mockSession)
      expect(mockAuth).toHaveBeenCalledTimes(1)
    })

    it('returns null when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const session = await getServerSession()

      expect(session).toBeNull()
      expect(mockAuth).toHaveBeenCalledTimes(1)
    })

    it('returns session with minimal user data', async () => {
      const mockSession = {
        user: {
          id: 'user-456',
          email: 'minimal@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const session = await getServerSession()

      expect(session).toEqual(mockSession)
      expect(session?.user.id).toBe('user-456')
      expect(session?.user.email).toBe('minimal@example.com')
    })
  })

  describe('requireAuth', () => {
    it('returns session when user is authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await requireAuth()

      expect(result).toEqual(mockSession)
      expect(result).not.toBeInstanceOf(NextResponse)
    })

    it('returns 401 NextResponse when session is null', async () => {
      mockAuth.mockResolvedValue(null)

      const result = await requireAuth()

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(401)
      
      const body = await response.json()
      expect(body).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required',
      })
    })

    it('returns 401 NextResponse when session has no user', async () => {
      const mockSession = {
        user: undefined,
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const result = await requireAuth()

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(401)
    })

    it('returns 401 NextResponse when user is null', async () => {
      const mockSession = {
        user: null,
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const result = await requireAuth()

      expect(result).toBeInstanceOf(NextResponse)
      const response = result as NextResponse
      expect(response.status).toBe(401)
    })

    it('can be used in API route pattern', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const authResult = await requireAuth()
      
      if (authResult instanceof NextResponse) {
        expect.fail('Should not return NextResponse for authenticated user')
      }
      
      expect(authResult.user.id).toBe('user-123')
    })
  })

  describe('hasRole', () => {
    it('returns true for "user" role when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await hasRole('user')

      expect(result).toBe(true)
    })

    it('returns false for "user" role when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const result = await hasRole('user')

      expect(result).toBe(false)
    })

    it('returns false for "user" role when session has no user', async () => {
      const mockSession = {
        user: undefined,
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const result = await hasRole('user')

      expect(result).toBe(false)
    })

    it('returns true for "admin" role when email matches admin email', async () => {
      const mockSession = {
        user: {
          id: 'admin-123',
          email: 'admin@swarmui.local',
          role: 'admin' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await hasRole('admin')

      expect(result).toBe(true)
    })

    it('returns false for "admin" role when email does not match', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'regular@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await hasRole('admin')

      expect(result).toBe(false)
    })

    it('returns false for "admin" role when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const result = await hasRole('admin')

      expect(result).toBe(false)
    })

    it('returns false for unknown role', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await hasRole('superadmin')

      expect(result).toBe(false)
    })

    it('returns false for empty role string', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await hasRole('')

      expect(result).toBe(false)
    })

    it('handles case-sensitive role checking', async () => {
      const mockSession = {
        user: {
          id: 'admin-123',
          email: 'admin@swarmui.local',
          role: 'admin' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      expect(await hasRole('Admin')).toBe(false)
      expect(await hasRole('ADMIN')).toBe(false)
      expect(await hasRole('admin')).toBe(true)
    })

    it('handles case-sensitive email matching for admin', async () => {
      const mockSession = {
        user: {
          id: 'admin-123',
          email: 'Admin@SwarmUI.Local',
          role: 'admin' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = await hasRole('admin')

      expect(result).toBe(false)
    })
  })

  describe('getCurrentUserId', () => {
    it('returns user ID when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-abc-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const userId = await getCurrentUserId()

      expect(userId).toBe('user-abc-123')
    })

    it('returns null when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const userId = await getCurrentUserId()

      expect(userId).toBeNull()
    })

    it('returns null when session has no user', async () => {
      const mockSession = {
        user: undefined,
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const userId = await getCurrentUserId()

      expect(userId).toBeNull()
    })

    it('returns null when user has no ID', async () => {
      const mockSession = {
        user: {
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const userId = await getCurrentUserId()

      expect(userId).toBeNull()
    })

    it('returns correct ID for different user types', async () => {
      const testCases = [
        { id: 'demo-user', expected: 'demo-user' },
        { id: 'github-12345', expected: 'github-12345' },
        { id: 'google-oauth-abc', expected: 'google-oauth-abc' },
        { id: '123', expected: '123' },
      ]

      for (const testCase of testCases) {
        const mockSession = {
          user: {
            id: testCase.id,
            email: 'test@example.com',
            role: 'editor' as const,
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        }
        mockAuth.mockResolvedValue(mockSession)

        const userId = await getCurrentUserId()
        expect(userId).toBe(testCase.expected)
      }
    })
  })

  describe('getCurrentUserEmail', () => {
    it('returns user email when authenticated', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const email = await getCurrentUserEmail()

      expect(email).toBe('test@example.com')
    })

    it('returns null when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const email = await getCurrentUserEmail()

      expect(email).toBeNull()
    })

    it('returns null when session has no user', async () => {
      const mockSession = {
        user: undefined,
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const email = await getCurrentUserEmail()

      expect(email).toBeNull()
    })

    it('returns null when user has no email', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const email = await getCurrentUserEmail()

      expect(email).toBeNull()
    })

    it('handles various email formats', async () => {
      const testEmails = [
        'simple@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'admin@swarmui.local',
        'test@subdomain.example.com',
      ]

      for (const testEmail of testEmails) {
        const mockSession = {
          user: {
            id: 'user-123',
            email: testEmail,
            role: 'editor' as const,
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        }
        mockAuth.mockResolvedValue(mockSession)

        const email = await getCurrentUserEmail()
        expect(email).toBe(testEmail)
      }
    })
  })

  describe('integration scenarios', () => {
    it('all functions work together for authenticated user', async () => {
      const mockSession = {
        user: {
          id: 'user-integration-test',
          email: 'integration@example.com',
          name: 'Integration Test User',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const session = await getServerSession()
      const authResult = await requireAuth()
      const isUser = await hasRole('user')
      const isAdmin = await hasRole('admin')
      const userId = await getCurrentUserId()
      const userEmail = await getCurrentUserEmail()

      expect(session).toEqual(mockSession)
      expect(authResult).toEqual(mockSession)
      expect(isUser).toBe(true)
      expect(isAdmin).toBe(false)
      expect(userId).toBe('user-integration-test')
      expect(userEmail).toBe('integration@example.com')
    })

    it('all functions work together for admin user', async () => {
      const mockSession = {
        user: {
          id: 'admin-integration-test',
          email: 'admin@swarmui.local',
          name: 'Admin User',
          role: 'admin' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const session = await getServerSession()
      const authResult = await requireAuth()
      const isUser = await hasRole('user')
      const isAdmin = await hasRole('admin')
      const userId = await getCurrentUserId()
      const userEmail = await getCurrentUserEmail()

      expect(session).toEqual(mockSession)
      expect(authResult).toEqual(mockSession)
      expect(isUser).toBe(true)
      expect(isAdmin).toBe(true)
      expect(userId).toBe('admin-integration-test')
      expect(userEmail).toBe('admin@swarmui.local')
    })

    it('all functions handle unauthenticated state consistently', async () => {
      mockAuth.mockResolvedValue(null)

      const session = await getServerSession()
      const authResult = await requireAuth()
      const isUser = await hasRole('user')
      const isAdmin = await hasRole('admin')
      const userId = await getCurrentUserId()
      const userEmail = await getCurrentUserEmail()

      expect(session).toBeNull()
      expect(authResult).toBeInstanceOf(NextResponse)
      expect(isUser).toBe(false)
      expect(isAdmin).toBe(false)
      expect(userId).toBeNull()
      expect(userEmail).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('handles auth function throwing an error', async () => {
      mockAuth.mockRejectedValue(new Error('Auth service unavailable'))

      await expect(getServerSession()).rejects.toThrow('Auth service unavailable')
      await expect(requireAuth()).rejects.toThrow('Auth service unavailable')
      await expect(hasRole('user')).rejects.toThrow('Auth service unavailable')
      await expect(getCurrentUserId()).rejects.toThrow('Auth service unavailable')
      await expect(getCurrentUserEmail()).rejects.toThrow('Auth service unavailable')
    })

    it('handles session with empty string values', async () => {
      const mockSession = {
        user: {
          id: '',
          email: '',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const userId = await getCurrentUserId()
      const userEmail = await getCurrentUserEmail()

      expect(userId).toBe('')
      expect(userEmail).toBe('')
    })

    it('handles expired session (auth still returns it)', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          role: 'editor' as const,
        },
        expires: new Date(Date.now() - 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession)

      const session = await getServerSession()
      const authResult = await requireAuth()

      expect(session).toEqual(mockSession)
      expect(authResult).toEqual(mockSession)
    })

    it('handles session with extra user properties', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'editor' as const,
          image: 'https://example.com/avatar.png',
          customField: 'custom value',
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      }
      mockAuth.mockResolvedValue(mockSession as unknown as Session | null)

      const session = await getServerSession()
      const userId = await getCurrentUserId()
      const userEmail = await getCurrentUserEmail()

      expect(session).toEqual(mockSession)
      expect(userId).toBe('user-123')
      expect(userEmail).toBe('test@example.com')
    })
  })
})
