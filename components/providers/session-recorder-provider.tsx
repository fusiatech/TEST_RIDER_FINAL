'use client'

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { 
  getSessionRecorder, 
  initSessionRecorder, 
  type SessionRecorder,
  type SessionRecorderConfig,
} from '@/lib/session-recorder'

interface SessionRecorderContextValue {
  recorder: SessionRecorder
  recordCustomEvent: (name: string, data?: Record<string, unknown>) => void
  recordError: (error: Error, context?: Record<string, unknown>) => void
  exportCurrentSession: () => string
  downloadSession: (sessionId?: string) => void
  getSavedSessions: () => { id: string; startedAt: number; eventCount: number }[]
  clearSessions: () => void
  isEnabled: () => boolean
  setEnabled: (enabled: boolean) => void
  getConfig: () => SessionRecorderConfig
  updateConfig: (updates: Partial<SessionRecorderConfig>) => void
}

const SessionRecorderContext = createContext<SessionRecorderContextValue | null>(null)

interface SessionRecorderProviderProps {
  children: ReactNode
  config?: Partial<SessionRecorderConfig>
}

export function SessionRecorderProvider({ 
  children, 
  config,
}: SessionRecorderProviderProps) {
  const recorderRef = useRef<SessionRecorder | null>(null)
  const pathname = usePathname()
  const previousPathname = useRef<string>('')

  useEffect(() => {
    const recorder = initSessionRecorder(config)
    recorderRef.current = recorder
    recorder.start()

    const handleBeforeUnload = () => {
      recorder.stop()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      recorder.stop()
    }
  }, [config])

  useEffect(() => {
    if (previousPathname.current && previousPathname.current !== pathname) {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.recordNavigation(pathname, 'route_change')
    }
    previousPathname.current = pathname
  }, [pathname])

  const contextValue: SessionRecorderContextValue = {
    recorder: recorderRef.current || getSessionRecorder(),
    
    recordCustomEvent: (name: string, data?: Record<string, unknown>) => {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.recordCustomEvent(name, data)
    },

    recordError: (error: Error, context?: Record<string, unknown>) => {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.recordError(error, context)
    },

    exportCurrentSession: () => {
      const recorder = recorderRef.current || getSessionRecorder()
      return recorder.exportSession()
    },

    downloadSession: (sessionId?: string) => {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.downloadSession(sessionId)
    },

    getSavedSessions: () => {
      const recorder = recorderRef.current || getSessionRecorder()
      return recorder.getSavedSessions().map(s => ({
        id: s.id,
        startedAt: s.startedAt,
        eventCount: s.events.length,
      }))
    },

    clearSessions: () => {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.clearSavedSessions()
    },

    isEnabled: () => {
      const recorder = recorderRef.current || getSessionRecorder()
      return recorder.getConfig().enabled
    },

    setEnabled: (enabled: boolean) => {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.updateConfig({ enabled })
      if (enabled && !recorder.isActive()) {
        recorder.start()
      } else if (!enabled && recorder.isActive()) {
        recorder.stop()
      }
    },

    getConfig: () => {
      const recorder = recorderRef.current || getSessionRecorder()
      return recorder.getConfig()
    },

    updateConfig: (updates: Partial<SessionRecorderConfig>) => {
      const recorder = recorderRef.current || getSessionRecorder()
      recorder.updateConfig(updates)
    },
  }

  return (
    <SessionRecorderContext.Provider value={contextValue}>
      {children}
    </SessionRecorderContext.Provider>
  )
}

export function useSessionRecorder(): SessionRecorderContextValue {
  const context = useContext(SessionRecorderContext)
  if (!context) {
    const recorder = getSessionRecorder()
    return {
      recorder,
      recordCustomEvent: (name, data) => recorder.recordCustomEvent(name, data),
      recordError: (error, context) => recorder.recordError(error, context),
      exportCurrentSession: () => recorder.exportSession(),
      downloadSession: (sessionId) => recorder.downloadSession(sessionId),
      getSavedSessions: () => recorder.getSavedSessions().map(s => ({
        id: s.id,
        startedAt: s.startedAt,
        eventCount: s.events.length,
      })),
      clearSessions: () => recorder.clearSavedSessions(),
      isEnabled: () => recorder.getConfig().enabled,
      setEnabled: (enabled) => recorder.updateConfig({ enabled }),
      getConfig: () => recorder.getConfig(),
      updateConfig: (updates) => recorder.updateConfig(updates),
    }
  }
  return context
}
