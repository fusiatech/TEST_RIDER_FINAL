import { describe, it, expect } from 'vitest'
import { PactV3, MatchersV3 } from '@pact-foundation/pact'
import path from 'path'

const { like, eachLike, integer, string, uuid } = MatchersV3

const provider = new PactV3({
  consumer: 'SwarmUI-Frontend',
  provider: 'SwarmUI-API',
  dir: path.resolve(process.cwd(), 'tests/contract/pacts'),
  logLevel: 'warn',
})

// Note: Pact contract tests are skipped due to pact-core file writing issues
// These tests require proper pact infrastructure setup
describe.skip('Sessions API Contract', () => {
  describe('GET /api/sessions', () => {
    it('returns an empty array when no sessions exist', async () => {
      await provider
        .given('no sessions exist')
        .uponReceiving('a request for all sessions')
        .withRequest({
          method: 'GET',
          path: '/api/sessions',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: [],
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/sessions`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual([])
      })
    })

    it.skip('returns sessions when they exist', async () => {
      await provider
        .given('sessions exist')
        .uponReceiving('a request for all sessions with data')
        .withRequest({
          method: 'GET',
          path: '/api/sessions',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: eachLike({
            id: uuid('550e8400-e29b-41d4-a716-446655440000'),
            title: string('Test Session'),
            createdAt: integer(1709000000000),
            updatedAt: integer(1709000000000),
            messages: eachLike({
              id: uuid('550e8400-e29b-41d4-a716-446655440001'),
              role: string('user'),
              content: string('Hello, world!'),
              timestamp: integer(1709000000000),
            }),
          }),
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/sessions`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toBeInstanceOf(Array)
        expect(body.length).toBeGreaterThan(0)
        expect(body[0]).toHaveProperty('id')
        expect(body[0]).toHaveProperty('title')
        expect(body[0]).toHaveProperty('messages')
      })
    })
  })

  describe('POST /api/sessions', () => {
    it('creates a new session successfully', async () => {
      const newSession = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'New Session',
        createdAt: 1709000000000,
        updatedAt: 1709000000000,
        messages: [],
      }

      await provider
        .given('the server accepts new sessions')
        .uponReceiving('a request to create a new session')
        .withRequest({
          method: 'POST',
          path: '/api/sessions',
          headers: {
            'Content-Type': 'application/json',
          },
          body: newSession,
        })
        .willRespondWith({
          status: 201,
          headers: {
            'Content-Type': 'application/json',
          },
          body: like({
            id: string('550e8400-e29b-41d4-a716-446655440002'),
            title: string('New Session'),
            createdAt: integer(1709000000000),
            updatedAt: integer(1709000000000),
            messages: [],
          }),
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newSession),
        })
        const body = await response.json()

        expect(response.status).toBe(201)
        expect(body.id).toBe(newSession.id)
        expect(body.title).toBe(newSession.title)
      })
    })

    it.skip('returns 400 for invalid session data', async () => {
      const invalidSession = {
        title: 'Missing required fields',
      }

      await provider
        .given('the server validates session data')
        .uponReceiving('a request to create an invalid session')
        .withRequest({
          method: 'POST',
          path: '/api/sessions',
          headers: {
            'Content-Type': 'application/json',
          },
          body: invalidSession,
        })
        .willRespondWith({
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: string('Invalid session: Required'),
          },
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(invalidSession),
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.error).toBeDefined()
      })
    })
  })
})
