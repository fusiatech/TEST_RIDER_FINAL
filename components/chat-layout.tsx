'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/sidebar'
import { ChatView } from '@/components/chat-view'
import { SettingsPanel } from '@/components/settings-panel'
import { GlobalProgress } from '@/components/global-progress'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { Onboarding } from '@/components/onboarding'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Toaster } from 'sonner'
import { useSwarmStore } from '@/lib/store'

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
        <ChatView />
        <SettingsPanel />
      </div>
      <KeyboardShortcuts />
      <Onboarding />
      <ConfirmDialog />
      <Toaster theme="dark" richColors />
    </div>
  )
}
