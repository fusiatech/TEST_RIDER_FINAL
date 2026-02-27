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
describe.skip('Projects API Contract', () => {
  describe('GET /api/projects', () => {
    it('returns an empty array when no projects exist', async () => {
      await provider
        .given('no projects exist')
        .uponReceiving('a request for all projects')
        .withRequest({
          method: 'GET',
          path: '/api/projects',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: [],
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/projects`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual([])
      })
    })

    it.skip('returns projects when they exist', async () => {
      await provider
        .given('projects exist')
        .uponReceiving('a request for all projects with data')
        .withRequest({
          method: 'GET',
          path: '/api/projects',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: eachLike({
            id: uuid('550e8400-e29b-41d4-a716-446655440010'),
            name: string('Test Project'),
            description: string('A test project for contract testing'),
            features: [],
            epics: [],
            tickets: [],
            status: string('planning'),
            createdAt: integer(1709000000000),
            updatedAt: integer(1709000000000),
          }),
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/projects`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toBeInstanceOf(Array)
        expect(body.length).toBeGreaterThan(0)
        expect(body[0]).toHaveProperty('id')
        expect(body[0]).toHaveProperty('name')
        expect(body[0]).toHaveProperty('description')
        expect(body[0]).toHaveProperty('status')
      })
    })

    it('returns projects with tickets', async () => {
      await provider
        .given('projects with tickets exist')
        .uponReceiving('a request for projects with ticket data')
        .withRequest({
          method: 'GET',
          path: '/api/projects',
        })
        .willRespondWith({
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: eachLike({
            id: uuid('550e8400-e29b-41d4-a716-446655440011'),
            name: string('Project with Tickets'),
            description: string('A project containing tickets'),
            features: [],
            epics: [],
            tickets: eachLike({
              id: uuid('550e8400-e29b-41d4-a716-446655440012'),
              projectId: string('550e8400-e29b-41d4-a716-446655440011'),
              title: string('Sample Ticket'),
              description: string('A sample ticket description'),
              acceptanceCriteria: [],
              complexity: string('M'),
              status: string('backlog'),
              assignedRole: string('coder'),
              dependencies: [],
              createdAt: integer(1709000000000),
              updatedAt: integer(1709000000000),
            }),
            status: string('in_progress'),
            createdAt: integer(1709000000000),
            updatedAt: integer(1709000000000),
          }),
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/projects`)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body[0].tickets).toBeInstanceOf(Array)
        expect(body[0].tickets.length).toBeGreaterThan(0)
        expect(body[0].tickets[0]).toHaveProperty('title')
        expect(body[0].tickets[0]).toHaveProperty('status')
      })
    })
  })

  describe('POST /api/projects', () => {
    it.skip('creates a new project successfully', async () => {
      const newProject = {
        id: '550e8400-e29b-41d4-a716-446655440020',
        name: 'New Project',
        description: 'A newly created project',
        features: [],
        epics: [],
        tickets: [],
        status: 'planning',
        createdAt: 1709000000000,
        updatedAt: 1709000000000,
      }

      await provider
        .given('the server accepts new projects')
        .uponReceiving('a request to create a new project')
        .withRequest({
          method: 'POST',
          path: '/api/projects',
          headers: {
            'Content-Type': 'application/json',
          },
          body: newProject,
        })
        .willRespondWith({
          status: 201,
          headers: {
            'Content-Type': 'application/json',
          },
          body: like({
            id: string('550e8400-e29b-41d4-a716-446655440020'),
            name: string('New Project'),
            description: string('A newly created project'),
            features: [],
            epics: [],
            tickets: [],
            status: string('planning'),
            createdAt: integer(1709000000000),
            updatedAt: integer(1709000000000),
          }),
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newProject),
        })
        const body = await response.json()

        expect(response.status).toBe(201)
        expect(body.id).toBe(newProject.id)
        expect(body.name).toBe(newProject.name)
        expect(body.status).toBe('planning')
      })
    })

    it('returns 400 for invalid project data', async () => {
      const invalidProject = {
        name: 'Missing required fields',
      }

      await provider
        .given('the server validates project data')
        .uponReceiving('a request to create an invalid project')
        .withRequest({
          method: 'POST',
          path: '/api/projects',
          headers: {
            'Content-Type': 'application/json',
          },
          body: invalidProject,
        })
        .willRespondWith({
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: string('Invalid project: Required'),
          },
        })

      await provider.executeTest(async (mockServer: { url: string }) => {
        const response = await fetch(`${mockServer.url}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(invalidProject),
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.error).toBeDefined()
      })
    })
  })
})
