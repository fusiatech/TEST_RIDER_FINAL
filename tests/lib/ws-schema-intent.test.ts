import { describe, expect, it } from 'vitest'
import { WSMessageSchema } from '@/lib/types'

describe('WSMessageSchema start-swarm intent', () => {
  it('accepts a valid intent', () => {
    const parsed = WSMessageSchema.safeParse({
      type: 'start-swarm',
      prompt: 'test',
      sessionId: 'session-1',
      mode: 'chat',
      intent: 'code_review',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an invalid intent', () => {
    const parsed = WSMessageSchema.safeParse({
      type: 'start-swarm',
      prompt: 'test',
      sessionId: 'session-1',
      mode: 'chat',
      intent: 'invalid-intent',
    })
    expect(parsed.success).toBe(false)
  })
})

