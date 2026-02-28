import { WSMessageSchema } from '@/lib/types'
import type { WSMessage } from '@/lib/types'

export type FileChangeHandler = (event: 'add' | 'change' | 'unlink', path: string) => void
export type WSConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'auth_failed' | 'closed'

const BASE_RECONNECT_DELAY_MS = 1000
const MAX_RECONNECT_DELAY_MS = 10000
const MAX_PENDING_MESSAGES = 100
const PENDING_MESSAGE_TTL_MS = 30_000
const AUTH_CLOSE_CODES = new Set([1008, 4001, 4003, 4401, 4403])
const WS_ENDPOINT_PATH = '/api/ws'

interface PendingMessage {
  msg: WSMessage
  enqueuedAt: number
}

function getWindowWsUrl(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${WS_ENDPOINT_PATH}`
}

function normalizeWsUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    try {
      const parsed = new URL(trimmed)
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = WS_ENDPOINT_PATH
      }
      return parsed.toString().replace(/\/$/, '')
    } catch {
      return null
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed)
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = WS_ENDPOINT_PATH
      }
      return parsed.toString().replace(/\/$/, '')
    } catch {
      return null
    }
  }

  return null
}

function getDefaultWsUrl(): string {
  if (typeof window !== 'undefined') {
    // Always prefer same-origin websocket URL in browser to preserve auth cookies.
    const sameOrigin = getWindowWsUrl()
    if (sameOrigin) {
      return sameOrigin
    }
    const configuredUrl = process.env.NEXT_PUBLIC_WS_URL
    if (configuredUrl) {
      const normalized = normalizeWsUrl(configuredUrl)
      if (normalized) {
        return normalized
      }
    }
    return `ws://localhost:3000${WS_ENDPOINT_PATH}`
  }
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL
  if (configuredUrl) {
    const normalized = normalizeWsUrl(configuredUrl)
    if (normalized) {
      return normalized
    }
  }
  return `ws://localhost:3000${WS_ENDPOINT_PATH}`
}

function isAuthClose(code: number, reason: string): boolean {
  if (AUTH_CLOSE_CODES.has(code)) {
    return true
  }
  const normalizedReason = reason.toLowerCase()
  return normalizedReason.includes('auth') || normalizedReason.includes('unauthorized')
}

export class SwarmWSClient {
  private ws: WebSocket | null = null
  private url = getDefaultWsUrl()
  private retryCount = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = true
  private fallbackTried = false
  private pendingMessages: PendingMessage[] = []
  private state: WSConnectionState = 'idle'
  private messageListeners = new Set<(msg: WSMessage) => void>()

  onConnect: (() => void) | null = null
  onMessage: ((msg: WSMessage) => void) | null = null
  onDisconnect: (() => void) | null = null
  onFileChange: FileChangeHandler | null = null
  onAuthError: ((error: string) => void) | null = null
  onConnectionStateChange: ((state: WSConnectionState) => void) | null = null

  connect(url?: string): void {
    if (url) {
      const normalized = normalizeWsUrl(url)
      this.url = normalized ?? url
    }
    this.shouldReconnect = true
    this.retryCount = 0
    this.fallbackTried = false
    this.createConnection()
  }

  getConnectionState(): WSConnectionState {
    return this.state
  }

  private setState(nextState: WSConnectionState): void {
    if (this.state === nextState) return
    this.state = nextState
    this.onConnectionStateChange?.(nextState)
  }

  private createConnection(): void {
    if (!this.shouldReconnect) {
      return
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.setState(this.retryCount > 0 ? 'reconnecting' : 'connecting')

    try {
      console.info(`[SwarmWSClient] Connecting to ${this.url}`)
      this.ws = new WebSocket(this.url)
    } catch {
      if (!this.fallbackTried) {
        const browserUrl = getWindowWsUrl()
        if (browserUrl && browserUrl !== this.url) {
          this.fallbackTried = true
          this.url = browserUrl
          this.createConnection()
          return
        }
      }
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.retryCount = 0
      this.fallbackTried = false
      this.setState('open')
      this.flushPendingMessages()
      this.onConnect?.()
    }

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleIncoming(String(event.data))
    }

    this.ws.onclose = (event: CloseEvent) => {
      const code = typeof event.code === 'number' ? event.code : 1006
      const reason = typeof event.reason === 'string' ? event.reason : ''
      this.ws = null
      this.onDisconnect?.()

      if (!this.shouldReconnect) {
        this.setState('closed')
        return
      }

      if (isAuthClose(code, reason)) {
        if (!this.fallbackTried) {
          const browserUrl = getWindowWsUrl()
          if (browserUrl && browserUrl !== this.url) {
            this.fallbackTried = true
            this.url = browserUrl
            console.warn(`[SwarmWSClient] Auth close on configured URL; retrying same-origin WebSocket URL: ${browserUrl}`)
            this.createConnection()
            return
          }
        }
        this.shouldReconnect = false
        this.clearReconnectTimer()
        this.setState('auth_failed')
        this.onAuthError?.(`WebSocket authentication failed (code ${code})`)
        return
      }

      if (!this.fallbackTried) {
        const browserUrl = getWindowWsUrl()
        if (browserUrl && browserUrl !== this.url) {
          this.fallbackTried = true
          this.url = browserUrl
          console.warn(`[SwarmWSClient] Falling back to current host WebSocket URL: ${browserUrl}`)
          this.createConnection()
          return
        }
      }

      this.setState('reconnecting')
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
    for (const listener of this.messageListeners) {
      try {
        listener(msg)
      } catch (error) {
        console.warn('[SwarmWSClient] Message listener failed', error)
      }
    }
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
      return
    }

    this.enqueuePendingMessage(msg)
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.createConnection()
    }
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.clearReconnectTimer()
    this.pendingMessages = []
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState('closed')
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  addMessageListener(listener: (msg: WSMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => {
      this.messageListeners.delete(listener)
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return
    this.clearReconnectTimer()
    this.retryCount++
    const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, this.retryCount - 1), MAX_RECONNECT_DELAY_MS)
    this.reconnectTimer = setTimeout(() => {
      this.createConnection()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private enqueuePendingMessage(msg: WSMessage): void {
    this.prunePendingMessages()
    if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
      this.pendingMessages.shift()
      console.warn('[SwarmWSClient] Dropping oldest pending WebSocket message (queue full)')
    }
    this.pendingMessages.push({ msg, enqueuedAt: Date.now() })
    console.warn('[SwarmWSClient] WebSocket not open - queued outbound message', { type: msg.type })
  }

  private flushPendingMessages(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    this.prunePendingMessages()
    if (this.pendingMessages.length === 0) {
      return
    }

    const pending = [...this.pendingMessages]
    this.pendingMessages = []
    for (const entry of pending) {
      this.ws.send(JSON.stringify(entry.msg))
    }
  }

  private prunePendingMessages(): void {
    const now = Date.now()
    this.pendingMessages = this.pendingMessages.filter(
      (entry) => now - entry.enqueuedAt <= PENDING_MESSAGE_TTL_MS
    )
  }
}

export const wsClient = new SwarmWSClient()
