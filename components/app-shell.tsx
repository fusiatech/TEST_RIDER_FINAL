'use client'

import { ChatLayout } from '@/components/chat-layout'
import { ErrorBoundary } from '@/components/error-boundary'

export function AppShell() {
  return (
    <ErrorBoundary>
      <ChatLayout />
    </ErrorBoundary>
  )
}
