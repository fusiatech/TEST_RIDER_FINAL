import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WSMessage } from '@/lib/types'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.CONNECTING
  sentMessages: string[] = []

  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: (() => void) | null = null

  constructor(_url: string) {
    MockWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sentMessages.push(data)
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: 1000 } as CloseEvent)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }
}

describe('SwarmWSClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.resetModules()
    delete process.env.NEXT_PUBLIC_WS_URL
  })

  it('queues outbound messages while connecting and flushes on open', async () => {
    process.env.NEXT_PUBLIC_WS_URL = 'ws://localhost:4100'
    const { wsClient } = await import('@/lib/ws-client')

    wsClient.connect('ws://localhost:4100')
    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()

    const msg: WSMessage = { type: 'start-swarm', prompt: 'test', sessionId: 's1', mode: 'chat' }
    wsClient.send(msg)
    expect(socket.sentMessages).toHaveLength(0)

    socket.open()
    expect(socket.sentMessages).toHaveLength(1)
    expect(JSON.parse(socket.sentMessages[0])).toMatchObject({ type: 'start-swarm', sessionId: 's1' })

    wsClient.disconnect()
  })

  it('sends immediately when socket is already open', async () => {
    process.env.NEXT_PUBLIC_WS_URL = 'ws://localhost:4100'
    const { wsClient } = await import('@/lib/ws-client')

    wsClient.connect('ws://localhost:4100')
    const socket = MockWebSocket.instances[0]
    socket.open()

    const msg: WSMessage = { type: 'ping' }
    wsClient.send(msg)

    expect(socket.sentMessages).toHaveLength(1)
    expect(JSON.parse(socket.sentMessages[0])).toEqual({ type: 'ping' })

    wsClient.disconnect()
  })
})
