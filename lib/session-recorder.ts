'use client'

export type SessionEventType = 'click' | 'input' | 'navigation' | 'error' | 'custom'

export interface SessionEvent {
  type: SessionEventType
  timestamp: number
  data: Record<string, unknown>
}

export interface RecordedSession {
  id: string
  startedAt: number
  endedAt?: number
  events: SessionEvent[]
  metadata: {
    userAgent: string
    screenWidth: number
    screenHeight: number
    url: string
  }
}

export interface SessionRecorderConfig {
  maxSessions: number
  maxEventsPerSession: number
  recordInputValues: boolean
  enabled: boolean
  sensitiveFieldPatterns: RegExp[]
}

const DEFAULT_CONFIG: SessionRecorderConfig = {
  maxSessions: 5,
  maxEventsPerSession: 1000,
  recordInputValues: false,
  enabled: true,
  sensitiveFieldPatterns: [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /credit[_-]?card/i,
    /cvv/i,
    /ssn/i,
  ],
}

const STORAGE_KEY = 'swarm-session-recordings'
const CONFIG_KEY = 'swarm-session-recorder-config'

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function getElementIdentifier(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const classes = element.className && typeof element.className === 'string'
    ? `.${element.className.split(' ').filter(Boolean).slice(0, 2).join('.')}`
    : ''
  const dataTestId = element.getAttribute('data-testid')
    ? `[data-testid="${element.getAttribute('data-testid')}"]`
    : ''
  const ariaLabel = element.getAttribute('aria-label')
    ? `[aria-label="${element.getAttribute('aria-label')?.slice(0, 30)}"]`
    : ''
  
  return `${tag}${id}${classes}${dataTestId}${ariaLabel}`.slice(0, 100)
}

function isSensitiveField(element: Element, patterns: RegExp[]): boolean {
  const name = element.getAttribute('name') || ''
  const id = element.id || ''
  const type = element.getAttribute('type') || ''
  const placeholder = element.getAttribute('placeholder') || ''
  const ariaLabel = element.getAttribute('aria-label') || ''
  
  const fieldsToCheck = [name, id, type, placeholder, ariaLabel]
  
  if (type === 'password') return true
  
  return patterns.some(pattern => 
    fieldsToCheck.some(field => pattern.test(field))
  )
}

class SessionRecorder {
  private events: SessionEvent[] = []
  private sessionId: string = ''
  private isRecording: boolean = false
  private config: SessionRecorderConfig
  private startedAt: number = 0
  private boundHandlers: {
    click?: (e: MouseEvent) => void
    input?: (e: Event) => void
    popstate?: () => void
    error?: (e: ErrorEvent) => void
    unhandledrejection?: (e: PromiseRejectionEvent) => void
  } = {}

  constructor(config: Partial<SessionRecorderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.loadConfig()
  }

  private loadConfig(): void {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(CONFIG_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SessionRecorderConfig>
        this.config = { 
          ...this.config, 
          ...parsed,
          sensitiveFieldPatterns: DEFAULT_CONFIG.sensitiveFieldPatterns,
        }
      }
    } catch {
      // Use default config
    }
  }

  saveConfig(): void {
    if (typeof window === 'undefined') return
    try {
      const configToSave = {
        maxSessions: this.config.maxSessions,
        maxEventsPerSession: this.config.maxEventsPerSession,
        recordInputValues: this.config.recordInputValues,
        enabled: this.config.enabled,
      }
      localStorage.setItem(CONFIG_KEY, JSON.stringify(configToSave))
    } catch {
      // Storage may be full or unavailable
    }
  }

  updateConfig(updates: Partial<SessionRecorderConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()
  }

  getConfig(): SessionRecorderConfig {
    return { ...this.config }
  }

  start(): void {
    if (typeof window === 'undefined') return
    if (this.isRecording) return
    if (!this.config.enabled) return

    this.sessionId = generateSessionId()
    this.events = []
    this.startedAt = Date.now()
    this.isRecording = true

    this.recordEvent('navigation', {
      action: 'session_start',
      url: window.location.href,
      pathname: window.location.pathname,
    })

    this.attachListeners()
  }

  stop(): void {
    if (!this.isRecording) return

    this.recordEvent('navigation', {
      action: 'session_end',
      url: typeof window !== 'undefined' ? window.location.href : '',
    })

    this.detachListeners()
    this.saveSession()
    this.isRecording = false
  }

  private attachListeners(): void {
    if (typeof window === 'undefined') return

    this.boundHandlers.click = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target) return

      this.recordEvent('click', {
        element: getElementIdentifier(target),
        x: e.clientX,
        y: e.clientY,
        button: e.button,
        text: (target.textContent || '').slice(0, 50).trim(),
      })
    }

    this.boundHandlers.input = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if (!target) return

      const isSensitive = isSensitiveField(target, this.config.sensitiveFieldPatterns)
      
      this.recordEvent('input', {
        element: getElementIdentifier(target),
        inputType: target.type || 'text',
        value: this.config.recordInputValues && !isSensitive 
          ? (target.value || '').slice(0, 100) 
          : '[redacted]',
        isSensitive,
      })
    }

    this.boundHandlers.popstate = () => {
      this.recordEvent('navigation', {
        action: 'popstate',
        url: window.location.href,
        pathname: window.location.pathname,
      })
    }

    this.boundHandlers.error = (e: ErrorEvent) => {
      this.recordEvent('error', {
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        type: 'uncaught_error',
      })
    }

    this.boundHandlers.unhandledrejection = (e: PromiseRejectionEvent) => {
      this.recordEvent('error', {
        message: e.reason?.message || String(e.reason),
        type: 'unhandled_rejection',
      })
    }

    document.addEventListener('click', this.boundHandlers.click, { capture: true, passive: true })
    document.addEventListener('input', this.boundHandlers.input, { capture: true, passive: true })
    window.addEventListener('popstate', this.boundHandlers.popstate)
    window.addEventListener('error', this.boundHandlers.error)
    window.addEventListener('unhandledrejection', this.boundHandlers.unhandledrejection)
  }

  private detachListeners(): void {
    if (typeof window === 'undefined') return

    if (this.boundHandlers.click) {
      document.removeEventListener('click', this.boundHandlers.click, { capture: true })
    }
    if (this.boundHandlers.input) {
      document.removeEventListener('input', this.boundHandlers.input, { capture: true })
    }
    if (this.boundHandlers.popstate) {
      window.removeEventListener('popstate', this.boundHandlers.popstate)
    }
    if (this.boundHandlers.error) {
      window.removeEventListener('error', this.boundHandlers.error)
    }
    if (this.boundHandlers.unhandledrejection) {
      window.removeEventListener('unhandledrejection', this.boundHandlers.unhandledrejection)
    }

    this.boundHandlers = {}
  }

  recordEvent(type: SessionEventType, data: Record<string, unknown>): void {
    if (!this.isRecording) return
    if (this.events.length >= this.config.maxEventsPerSession) return

    const event: SessionEvent = {
      type,
      timestamp: Date.now(),
      data,
    }

    this.events.push(event)
  }

  recordCustomEvent(name: string, data: Record<string, unknown> = {}): void {
    this.recordEvent('custom', { name, ...data })
  }

  recordError(error: Error, context?: Record<string, unknown>): void {
    this.recordEvent('error', {
      message: error.message,
      name: error.name,
      stack: error.stack?.slice(0, 500),
      type: 'recorded_error',
      ...context,
    })
  }

  recordNavigation(pathname: string, action: string = 'navigate'): void {
    this.recordEvent('navigation', {
      action,
      pathname,
      url: typeof window !== 'undefined' ? window.location.href : '',
    })
  }

  getEvents(): SessionEvent[] {
    return [...this.events]
  }

  getSessionId(): string {
    return this.sessionId
  }

  isActive(): boolean {
    return this.isRecording
  }

  private saveSession(): void {
    if (typeof window === 'undefined') return
    if (this.events.length === 0) return

    try {
      const session: RecordedSession = {
        id: this.sessionId,
        startedAt: this.startedAt,
        endedAt: Date.now(),
        events: this.events,
        metadata: {
          userAgent: navigator.userAgent,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          url: window.location.href,
        },
      }

      const existingSessions = this.getSavedSessions()
      existingSessions.unshift(session)

      const trimmedSessions = existingSessions.slice(0, this.config.maxSessions)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedSessions))
    } catch {
      // Storage may be full
    }
  }

  getSavedSessions(): RecordedSession[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      return JSON.parse(stored) as RecordedSession[]
    } catch {
      return []
    }
  }

  getSession(sessionId: string): RecordedSession | null {
    const sessions = this.getSavedSessions()
    return sessions.find(s => s.id === sessionId) || null
  }

  clearSavedSessions(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
  }

  exportSession(sessionId?: string): string {
    if (sessionId) {
      const session = this.getSession(sessionId)
      return session ? JSON.stringify(session, null, 2) : '{}'
    }

    if (this.isRecording && this.events.length > 0) {
      const currentSession: RecordedSession = {
        id: this.sessionId,
        startedAt: this.startedAt,
        events: this.events,
        metadata: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
          screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,
          url: typeof window !== 'undefined' ? window.location.href : '',
        },
      }
      return JSON.stringify(currentSession, null, 2)
    }

    return '{}'
  }

  exportAllSessions(): string {
    const sessions = this.getSavedSessions()
    return JSON.stringify(sessions, null, 2)
  }

  downloadSession(sessionId?: string): void {
    if (typeof window === 'undefined') return

    const data = sessionId ? this.exportSession(sessionId) : this.exportAllSessions()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = sessionId 
      ? `session-${sessionId}.json` 
      : `swarm-sessions-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

let recorderInstance: SessionRecorder | null = null

export function getSessionRecorder(): SessionRecorder {
  if (!recorderInstance) {
    recorderInstance = new SessionRecorder()
  }
  return recorderInstance
}

export function initSessionRecorder(config?: Partial<SessionRecorderConfig>): SessionRecorder {
  if (recorderInstance) {
    if (config) {
      recorderInstance.updateConfig(config)
    }
    return recorderInstance
  }
  recorderInstance = new SessionRecorder(config)
  return recorderInstance
}

export { SessionRecorder }
