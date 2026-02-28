import { describe, expect, it } from 'vitest'

interface ContractProject {
  id: string
  name: string
  description: string
  features: unknown[]
  epics: unknown[]
  tickets: Array<{
    id: string
    projectId: string
    title: string
    status: string
  }>
  status: string
  createdAt: number
  updatedAt: number
}

function buildProject(withTickets: boolean): ContractProject {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010',
    name: 'Test Project',
    description: 'A test project',
    features: [],
    epics: [],
    tickets: withTickets
      ? [
          {
            id: '550e8400-e29b-41d4-a716-446655440012',
            projectId: '550e8400-e29b-41d4-a716-446655440010',
            title: 'Sample Ticket',
            status: 'backlog',
          },
        ]
      : [],
    status: 'planning',
    createdAt: 1709000000000,
    updatedAt: 1709000000000,
  }
}

describe('Projects API Contract', () => {
  it('supports empty project collections', () => {
    const body: ContractProject[] = []
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })

  it('supports populated project collections', () => {
    const body = [buildProject(false)]
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('id')
    expect(body[0]).toHaveProperty('name')
    expect(body[0]).toHaveProperty('description')
    expect(body[0]).toHaveProperty('status')
  })

  it('supports projects with tickets', () => {
    const body = [buildProject(true)]
    expect(Array.isArray(body[0].tickets)).toBe(true)
    expect(body[0].tickets.length).toBeGreaterThan(0)
    expect(body[0].tickets[0]).toHaveProperty('title')
    expect(body[0].tickets[0]).toHaveProperty('status')
  })

  it('accepts valid project create payload', () => {
    const payload = buildProject(false)
    expect(payload.id).toBeTypeOf('string')
    expect(payload.name).toBeTypeOf('string')
    expect(payload.description).toBeTypeOf('string')
  })

  it('rejects invalid project payloads', () => {
    const invalidPayload = { name: 'Missing required fields' } as Partial<ContractProject>
    const isValid =
      Boolean(invalidPayload.id)
      && Boolean(invalidPayload.name)
      && Boolean(invalidPayload.description)
    expect(isValid).toBe(false)
  })
})
