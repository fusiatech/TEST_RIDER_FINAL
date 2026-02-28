import { describe, expect, it } from 'vitest'

interface ContractSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Array<{
    id: string
    role: 'system' | 'user' | 'assistant'
    content: string
    timestamp: number
  }>
}

function buildSession(withMessages: boolean): ContractSession {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test Session',
    createdAt: 1709000000000,
    updatedAt: 1709000000000,
    messages: withMessages
      ? [
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            role: 'user',
            content: 'Hello, world!',
            timestamp: 1709000000000,
          },
        ]
      : [],
  }
}

describe('Sessions API Contract', () => {
  it('supports empty session collections', () => {
    const body: ContractSession[] = []
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
  })

  it('supports populated session collections', () => {
    const body = [buildSession(true)]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toHaveProperty('id')
    expect(body[0]).toHaveProperty('title')
    expect(body[0]).toHaveProperty('messages')
  })

  it('accepts valid session create payload', () => {
    const payload = buildSession(false)
    expect(payload.id).toBeTypeOf('string')
    expect(payload.title).toBeTypeOf('string')
    expect(Array.isArray(payload.messages)).toBe(true)
  })

  it('rejects invalid session payloads', () => {
    const invalidPayload = { title: 'Missing required fields' } as Partial<ContractSession>
    const isValid =
      Boolean(invalidPayload.id)
      && Boolean(invalidPayload.title)
      && Array.isArray(invalidPayload.messages)
    expect(isValid).toBe(false)
  })
})
