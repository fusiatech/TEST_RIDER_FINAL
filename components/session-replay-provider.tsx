'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import {
  getSessionReplayEngine,
  initSessionReplay,
  type SessionReplayEngine,
  type ReplayConfig,
  type ReplayState,
  type ReplayCallbacks,
  type SessionEvent,
  type RecordedSession,
} from '@/lib/session-replay'

interface SessionReplayContextValue {
  engine: SessionReplayEngine
  state: ReplayState
  config: ReplayConfig
  hasConsent: boolean
  setConsent: (consent: boolean) => void
  loadSession: (sessionId: string) => boolean
  loadSessionData: (session: RecordedSession) => void
  play: () => void
  pause: () => void
  stop: () => void
  seekTo: (eventIndex: number) => void
  seekToTime: (timeMs: number) => void
  setPlaybackSpeed: (speed: number) => void
  updateConfig: (updates: Partial<ReplayConfig>) => void
  getAvailableSessions: () => { id: string; startedAt: number; eventCount: number; duration: number }[]
  getCurrentEvent: () => SessionEvent | null
  getSession: () => RecordedSession | null
  exportReplayData: () => string
  importReplayData: (jsonData: string) => boolean
}

const SessionReplayContext = createContext<SessionReplayContextValue | null>(null)

interface SessionReplayProviderProps {
  children: ReactNode
  config?: Partial<ReplayConfig>
  onEventPlay?: (event: SessionEvent, index: number) => void
  onComplete?: () => void
  onError?: (error: Error) => void
}

const isProduction = process.env.NODE_ENV === 'production'

export function SessionReplayProvider({
  children,
  config,
  onEventPlay,
  onComplete,
  onError,
}: SessionReplayProviderProps) {
  const engineRef = useRef<SessionReplayEngine | null>(null)
  const [state, setState] = useState<ReplayState>({
    sessionId: null,
    isPlaying: false,
    isPaused: false,
    currentEventIndex: 0,
    totalEvents: 0,
    elapsedTime: 0,
    duration: 0,
  })
  const [currentConfig, setCurrentConfig] = useState<ReplayConfig>(() => ({
    enabled: true,
    playbackSpeed: 1,
    showCursor: true,
    showClicks: true,
    showInputHighlights: true,
    autoPlay: false,
    ...config,
  }))
  const [hasConsent, setHasConsent] = useState(false)

  useEffect(() => {
    if (!isProduction && process.env.NODE_ENV !== 'development') {
      return
    }

    const engine = initSessionReplay(config)
    engineRef.current = engine

    const callbacks: ReplayCallbacks = {
      onEventPlay,
      onComplete,
      onError,
      onStateChange: (newState) => {
        setState(newState)
      },
    }
    engine.setCallbacks(callbacks)

    setHasConsent(engine.hasConsent())
    setCurrentConfig(engine.getConfig())

    return () => {
      engine.destroy()
    }
  }, [config, onEventPlay, onComplete, onError])

  const handleSetConsent = useCallback((consent: boolean) => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.setConsent(consent)
    setHasConsent(consent)
  }, [])

  const loadSession = useCallback((sessionId: string): boolean => {
    const engine = engineRef.current || getSessionReplayEngine()
    return engine.loadSession(sessionId)
  }, [])

  const loadSessionData = useCallback((session: RecordedSession): void => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.loadSessionData(session)
  }, [])

  const play = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.play()
  }, [])

  const pause = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.pause()
  }, [])

  const stop = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.stop()
  }, [])

  const seekTo = useCallback((eventIndex: number) => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.seekTo(eventIndex)
  }, [])

  const seekToTime = useCallback((timeMs: number) => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.seekToTime(timeMs)
  }, [])

  const setPlaybackSpeed = useCallback((speed: number) => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.setPlaybackSpeed(speed)
    setCurrentConfig(engine.getConfig())
  }, [])

  const updateConfig = useCallback((updates: Partial<ReplayConfig>) => {
    const engine = engineRef.current || getSessionReplayEngine()
    engine.updateConfig(updates)
    setCurrentConfig(engine.getConfig())
  }, [])

  const getAvailableSessions = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    return engine.getAvailableSessions()
  }, [])

  const getCurrentEvent = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    return engine.getCurrentEvent()
  }, [])

  const getSession = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    return engine.getSession()
  }, [])

  const exportReplayData = useCallback(() => {
    const engine = engineRef.current || getSessionReplayEngine()
    return engine.exportReplayData()
  }, [])

  const importReplayData = useCallback((jsonData: string): boolean => {
    const engine = engineRef.current || getSessionReplayEngine()
    return engine.importReplayData(jsonData)
  }, [])

  const contextValue: SessionReplayContextValue = {
    engine: engineRef.current || getSessionReplayEngine(),
    state,
    config: currentConfig,
    hasConsent,
    setConsent: handleSetConsent,
    loadSession,
    loadSessionData,
    play,
    pause,
    stop,
    seekTo,
    seekToTime,
    setPlaybackSpeed,
    updateConfig,
    getAvailableSessions,
    getCurrentEvent,
    getSession,
    exportReplayData,
    importReplayData,
  }

  return (
    <SessionReplayContext.Provider value={contextValue}>
      {children}
    </SessionReplayContext.Provider>
  )
}

export function useSessionReplay(): SessionReplayContextValue {
  const context = useContext(SessionReplayContext)
  if (!context) {
    const engine = getSessionReplayEngine()
    return {
      engine,
      state: engine.getState(),
      config: engine.getConfig(),
      hasConsent: engine.hasConsent(),
      setConsent: (consent) => engine.setConsent(consent),
      loadSession: (sessionId) => engine.loadSession(sessionId),
      loadSessionData: (session) => engine.loadSessionData(session),
      play: () => engine.play(),
      pause: () => engine.pause(),
      stop: () => engine.stop(),
      seekTo: (eventIndex) => engine.seekTo(eventIndex),
      seekToTime: (timeMs) => engine.seekToTime(timeMs),
      setPlaybackSpeed: (speed) => engine.setPlaybackSpeed(speed),
      updateConfig: (updates) => engine.updateConfig(updates),
      getAvailableSessions: () => engine.getAvailableSessions(),
      getCurrentEvent: () => engine.getCurrentEvent(),
      getSession: () => engine.getSession(),
      exportReplayData: () => engine.exportReplayData(),
      importReplayData: (jsonData) => engine.importReplayData(jsonData),
    }
  }
  return context
}

export function ConsentBanner({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 bg-background border border-border rounded-lg shadow-lg p-4">
      <h3 className="text-sm font-medium text-foreground mb-2">
        Session Recording & Replay
      </h3>
      <p className="text-xs text-muted mb-3">
        We use session recording to help improve your experience and debug issues. 
        Your data is stored locally and never sent to external servers. 
        Sensitive fields like passwords are automatically masked.
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onDecline}
          className="px-3 py-1.5 text-xs text-muted hover:text-foreground rounded-md border border-border hover:bg-muted/20 transition-colors"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

export function SessionReplayConsentWrapper({ children }: { children: ReactNode }) {
  const { hasConsent, setConsent } = useSessionReplay()
  const [showBanner, setShowBanner] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!checked) {
      setChecked(true)
      if (!hasConsent && typeof window !== 'undefined') {
        const dismissed = localStorage.getItem('swarm-session-replay-consent-dismissed')
        if (!dismissed) {
          setShowBanner(true)
        }
      }
    }
  }, [hasConsent, checked])

  const handleAccept = () => {
    setConsent(true)
    setShowBanner(false)
  }

  const handleDecline = () => {
    setConsent(false)
    setShowBanner(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('swarm-session-replay-consent-dismissed', 'true')
    }
  }

  return (
    <>
      {children}
      {showBanner && <ConsentBanner onAccept={handleAccept} onDecline={handleDecline} />}
    </>
  )
}
