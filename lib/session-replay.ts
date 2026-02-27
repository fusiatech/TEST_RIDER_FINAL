'use client'

import type { RecordedSession, SessionEvent } from '@/lib/session-recorder'
import { getSessionRecorder } from '@/lib/session-recorder'

export interface ReplayConfig {
  enabled: boolean
  playbackSpeed: number
  showCursor: boolean
  showClicks: boolean
  showInputHighlights: boolean
  autoPlay: boolean
}

export interface ReplayState {
  sessionId: string | null
  isPlaying: boolean
  isPaused: boolean
  currentEventIndex: number
  totalEvents: number
  elapsedTime: number
  duration: number
}

export interface ReplayCallbacks {
  onEventPlay?: (event: SessionEvent, index: number) => void
  onComplete?: () => void
  onError?: (error: Error) => void
  onStateChange?: (state: ReplayState) => void
}

const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  enabled: true,
  playbackSpeed: 1,
  showCursor: true,
  showClicks: true,
  showInputHighlights: true,
  autoPlay: false,
}

const REPLAY_CONFIG_KEY = 'swarm-session-replay-config'
const CONSENT_KEY = 'swarm-session-replay-consent'

function generateReplayId(): string {
  return `replay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

class SessionReplayEngine {
  private config: ReplayConfig
  private currentSession: RecordedSession | null = null
  private state: ReplayState = {
    sessionId: null,
    isPlaying: false,
    isPaused: false,
    currentEventIndex: 0,
    totalEvents: 0,
    elapsedTime: 0,
    duration: 0,
  }
  private callbacks: ReplayCallbacks = {}
  private playbackTimer: ReturnType<typeof setTimeout> | null = null
  private startTime: number = 0
  private pausedAt: number = 0
  private consentGiven: boolean = false

  constructor(config: Partial<ReplayConfig> = {}) {
    this.config = { ...DEFAULT_REPLAY_CONFIG, ...config }
    this.loadConfig()
    this.loadConsent()
  }

  private loadConfig(): void {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(REPLAY_CONFIG_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ReplayConfig>
        this.config = { ...this.config, ...parsed }
      }
    } catch {
      // Use default config
    }
  }

  saveConfig(): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(REPLAY_CONFIG_KEY, JSON.stringify(this.config))
    } catch {
      // Storage may be unavailable
    }
  }

  updateConfig(updates: Partial<ReplayConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()
  }

  getConfig(): ReplayConfig {
    return { ...this.config }
  }

  private loadConsent(): void {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(CONSENT_KEY)
      this.consentGiven = stored === 'true'
    } catch {
      this.consentGiven = false
    }
  }

  setConsent(consent: boolean): void {
    this.consentGiven = consent
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CONSENT_KEY, String(consent))
      } catch {
        // Storage may be unavailable
      }
    }
  }

  hasConsent(): boolean {
    return this.consentGiven
  }

  setCallbacks(callbacks: ReplayCallbacks): void {
    this.callbacks = callbacks
  }

  loadSession(sessionId: string): boolean {
    const recorder = getSessionRecorder()
    const session = recorder.getSession(sessionId)
    
    if (!session) {
      this.callbacks.onError?.(new Error(`Session not found: ${sessionId}`))
      return false
    }

    this.currentSession = session
    this.state = {
      sessionId,
      isPlaying: false,
      isPaused: false,
      currentEventIndex: 0,
      totalEvents: session.events.length,
      elapsedTime: 0,
      duration: this.calculateDuration(session),
    }
    this.notifyStateChange()
    return true
  }

  loadSessionData(session: RecordedSession): void {
    this.currentSession = session
    this.state = {
      sessionId: session.id,
      isPlaying: false,
      isPaused: false,
      currentEventIndex: 0,
      totalEvents: session.events.length,
      elapsedTime: 0,
      duration: this.calculateDuration(session),
    }
    this.notifyStateChange()
  }

  private calculateDuration(session: RecordedSession): number {
    if (session.events.length < 2) return 0
    const first = session.events[0].timestamp
    const last = session.events[session.events.length - 1].timestamp
    return last - first
  }

  play(): void {
    if (!this.currentSession || !this.config.enabled) return
    if (this.state.isPlaying && !this.state.isPaused) return

    if (this.state.isPaused) {
      this.state.isPaused = false
      const pauseDuration = Date.now() - this.pausedAt
      this.startTime += pauseDuration
    } else {
      this.state.isPlaying = true
      this.startTime = Date.now()
    }

    this.notifyStateChange()
    this.scheduleNextEvent()
  }

  pause(): void {
    if (!this.state.isPlaying || this.state.isPaused) return

    this.state.isPaused = true
    this.pausedAt = Date.now()
    
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer)
      this.playbackTimer = null
    }

    this.notifyStateChange()
  }

  stop(): void {
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer)
      this.playbackTimer = null
    }

    this.state = {
      ...this.state,
      isPlaying: false,
      isPaused: false,
      currentEventIndex: 0,
      elapsedTime: 0,
    }
    this.notifyStateChange()
  }

  seekTo(eventIndex: number): void {
    if (!this.currentSession) return
    
    const clampedIndex = Math.max(0, Math.min(eventIndex, this.currentSession.events.length - 1))
    this.state.currentEventIndex = clampedIndex

    if (clampedIndex > 0) {
      const firstTimestamp = this.currentSession.events[0].timestamp
      const targetTimestamp = this.currentSession.events[clampedIndex].timestamp
      this.state.elapsedTime = targetTimestamp - firstTimestamp
    } else {
      this.state.elapsedTime = 0
    }

    this.notifyStateChange()

    if (this.state.isPlaying && !this.state.isPaused) {
      if (this.playbackTimer) {
        clearTimeout(this.playbackTimer)
      }
      this.startTime = Date.now() - this.state.elapsedTime
      this.scheduleNextEvent()
    }
  }

  seekToTime(timeMs: number): void {
    if (!this.currentSession || this.currentSession.events.length === 0) return

    const firstTimestamp = this.currentSession.events[0].timestamp
    const targetTimestamp = firstTimestamp + timeMs

    let targetIndex = 0
    for (let i = 0; i < this.currentSession.events.length; i++) {
      if (this.currentSession.events[i].timestamp <= targetTimestamp) {
        targetIndex = i
      } else {
        break
      }
    }

    this.seekTo(targetIndex)
  }

  setPlaybackSpeed(speed: number): void {
    const clampedSpeed = Math.max(0.25, Math.min(4, speed))
    this.config.playbackSpeed = clampedSpeed
    this.saveConfig()

    if (this.state.isPlaying && !this.state.isPaused) {
      if (this.playbackTimer) {
        clearTimeout(this.playbackTimer)
      }
      this.scheduleNextEvent()
    }
  }

  private scheduleNextEvent(): void {
    if (!this.currentSession || !this.state.isPlaying || this.state.isPaused) return

    const events = this.currentSession.events
    const currentIndex = this.state.currentEventIndex

    if (currentIndex >= events.length) {
      this.state.isPlaying = false
      this.notifyStateChange()
      this.callbacks.onComplete?.()
      return
    }

    const currentEvent = events[currentIndex]
    const firstTimestamp = events[0].timestamp
    const eventTime = currentEvent.timestamp - firstTimestamp
    const elapsedReal = Date.now() - this.startTime
    const elapsedScaled = elapsedReal * this.config.playbackSpeed

    const delay = Math.max(0, (eventTime - elapsedScaled) / this.config.playbackSpeed)

    this.playbackTimer = setTimeout(() => {
      this.playEvent(currentEvent, currentIndex)
      this.state.currentEventIndex++
      this.state.elapsedTime = eventTime
      this.notifyStateChange()
      this.scheduleNextEvent()
    }, delay)
  }

  private playEvent(event: SessionEvent, index: number): void {
    this.callbacks.onEventPlay?.(event, index)
  }

  private notifyStateChange(): void {
    this.callbacks.onStateChange?.({ ...this.state })
  }

  getState(): ReplayState {
    return { ...this.state }
  }

  getCurrentEvent(): SessionEvent | null {
    if (!this.currentSession) return null
    return this.currentSession.events[this.state.currentEventIndex] ?? null
  }

  getSession(): RecordedSession | null {
    return this.currentSession
  }

  getAvailableSessions(): { id: string; startedAt: number; eventCount: number; duration: number }[] {
    const recorder = getSessionRecorder()
    return recorder.getSavedSessions().map(session => ({
      id: session.id,
      startedAt: session.startedAt,
      eventCount: session.events.length,
      duration: this.calculateDuration(session),
    }))
  }

  exportReplayData(): string {
    if (!this.currentSession) return '{}'
    
    return JSON.stringify({
      session: this.currentSession,
      config: this.config,
      exportedAt: new Date().toISOString(),
      replayId: generateReplayId(),
    }, null, 2)
  }

  importReplayData(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData) as { session?: RecordedSession }
      if (data.session) {
        this.loadSessionData(data.session)
        return true
      }
      return false
    } catch {
      this.callbacks.onError?.(new Error('Invalid replay data format'))
      return false
    }
  }

  destroy(): void {
    this.stop()
    this.currentSession = null
    this.callbacks = {}
  }
}

let replayInstance: SessionReplayEngine | null = null

export function getSessionReplayEngine(): SessionReplayEngine {
  if (!replayInstance) {
    replayInstance = new SessionReplayEngine()
  }
  return replayInstance
}

export function initSessionReplay(config?: Partial<ReplayConfig>): SessionReplayEngine {
  if (replayInstance) {
    if (config) {
      replayInstance.updateConfig(config)
    }
    return replayInstance
  }
  replayInstance = new SessionReplayEngine(config)
  return replayInstance
}

export function formatReplayTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    click: 'Click',
    input: 'Input',
    navigation: 'Navigation',
    error: 'Error',
    custom: 'Custom Event',
  }
  return labels[type] ?? type
}

export function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    click: '🖱️',
    input: '⌨️',
    navigation: '🔗',
    error: '⚠️',
    custom: '📌',
  }
  return icons[type] ?? '•'
}

export { SessionReplayEngine }
export type { RecordedSession, SessionEvent }
