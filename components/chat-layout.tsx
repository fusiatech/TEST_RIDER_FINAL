'use client'

import { useEffect, Suspense } from 'react'
import { Sidebar } from '@/components/sidebar'
import { ChatView } from '@/components/chat-view'
import { GlobalProgress } from '@/components/global-progress'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { Onboarding } from '@/components/onboarding'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useSwarmStore } from '@/lib/store'
import { Skeleton } from '@/components/ui/skeleton'

function ChatViewFallback() {
  return (
    <div className="flex-1 flex flex-col p-4 gap-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

export function ChatLayout() {
  const initWebSocket = useSwarmStore((s) => s.initWebSocket)

  const loadSessions = useSwarmStore((s) => s.loadSessions)
  const loadSettings = useSwarmStore((s) => s.loadSettings)

  useEffect(() => {
    initWebSocket()
    void loadSessions()
    void loadSettings()
  }, [initWebSocket, loadSessions, loadSettings])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <GlobalProgress />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main id="main-content" className="flex-1 flex flex-col overflow-hidden" tabIndex={-1}>
          <Suspense fallback={<ChatViewFallback />}>
            <ChatView />
          </Suspense>
        </main>
      </div>
      <KeyboardShortcuts />
      <Onboarding />
      <ConfirmDialog />
      {/* Screen reader announcements - Gap ID: G-A11Y-03 */}
      <div
        id="announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  )
}
