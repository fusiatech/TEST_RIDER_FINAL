import { WSMessageSchema } from '@/lib/types'
import type { WSMessage } from '@/lib/types'

export type FileChangeHandler = (event: 'add' | 'change' | 'unlink', path: string) => void

const MAX_RECONNECT_RETRIES = 5
const RECONNECT_DELAY_MS = 3000

function getDefaultWsUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL
  if (configuredUrl) {
    return configuredUrl
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  return 'ws://localhost:3000'
}

export class SwarmWSClient {
  private ws: WebSocket | null = null
  private url = getDefaultWsUrl()
  private retryCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true

  onConnect: (() => void) | null = null
  onMessage: ((msg: WSMessage) => void) | null = null
  onDisconnect: (() => void) | null = null
  onFileChange: FileChangeHandler | null = null
  onAuthError: ((error: string) => void) | null = null

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

    this.ws.onclose = (event: CloseEvent) => {
      this.onDisconnect?.()
      
      if (event.code === 1006 && this.retryCount === 0) {
        this.onAuthError?.('WebSocket connection failed - authentication may be required')
      }
      
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

    const msg = result.data

    if (msg.type === 'file-changed' && this.onFileChange) {
      this.onFileChange(msg.event, msg.path)
    }

    this.onMessage?.(msg)
  }

  watchProject(projectPath: string): void {
    this.send({ type: 'watch-project', projectPath })
  }

  unwatchProject(): void {
    this.send({ type: 'unwatch-project' })
  }

  send(msg: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      console.warn('[SwarmWSClient] Cannot send - WebSocket not open')
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
