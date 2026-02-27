'use client'

import { ChatLayout } from '@/components/chat-layout'
import { ErrorBoundary } from '@/components/error-boundary'
import { SessionRecorderProvider } from '@/components/providers/session-recorder-provider'

export function AppShell() {
  return (
    <SessionRecorderProvider>
      <ErrorBoundary>
        <ChatLayout />
      </ErrorBoundary>
    </SessionRecorderProvider>
  )
}
