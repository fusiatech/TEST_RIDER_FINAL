import { WSMessageSchema } from '@/lib/types'
import type { WSMessage } from '@/lib/types'

const MAX_RECONNECT_RETRIES = 5
const RECONNECT_DELAY_MS = 3000

export class SwarmWSClient {
  private ws: WebSocket | null = null
  private url: string = 'ws://localhost:3001'
  private retryCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true

  onMessage: ((msg: WSMessage) => void) | null = null
  onConnect: (() => void) | null = null
  onDisconnect: (() => void) | null = null

  connect(url?: string): void {
    if (url) {
      this.url = url
    }
    this.shouldReconnect = true
    this.retryCount = 0
    this.createConnection()
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.retryCount = 0
      this.onConnect?.()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleIncoming(String(event.data))
    }

    this.ws.onclose = () => {
      this.onDisconnect?.()
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose fires after onerror
    }
  }

  private handleIncoming(raw: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.warn('[SwarmWSClient] Received non-JSON message:', raw.slice(0, 100))
      return
    }

    const result = WSMessageSchema.safeParse(parsed)
    if (!result.success) {
      console.warn('[SwarmWSClient] Invalid message:', result.error.message)
      return
    }

    this.onMessage?.(result.data)
  }

  send(msg: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      console.warn('[SwarmWSClient] Cannot send — WebSocket not open')
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.clearReconnectTimer()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    if (this.retryCount >= MAX_RECONNECT_RETRIES) {
      console.warn('[SwarmWSClient] Max reconnect retries reached')
      return
    }
    this.clearReconnectTimer()
    this.retryCount++
    this.reconnectTimer = setTimeout(() => {
      this.createConnection()
    }, RECONNECT_DELAY_MS)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

export const wsClient = new SwarmWSClient()
