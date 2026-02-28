'use client'

import { useEffect, Suspense } from 'react'
import { Sidebar } from '@/components/sidebar'
import { ChatView } from '@/components/chat-view'
import { TopBar } from '@/components/top-bar'
import { GlobalProgress } from '@/components/global-progress'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { Onboarding } from '@/components/onboarding'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { LivePreview } from '@/components/live-preview'
import { SlidePanel } from '@/components/ui/slide-panel'
import { LoadingState } from '@/components/ui/loading-state'
import { useSwarmStore } from '@/lib/store'

function ChatViewFallback() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-2xl border border-border/70 bg-card/40 px-4 py-6">
        <LoadingState
          variant="workflow"
          size="lg"
          text="Preparing your workspace..."
          steps={['Profile', 'Sessions', 'Runtime', 'Ready']}
          activeStep={2}
        />
      </div>
    </div>
  )
}

export function ChatLayout() {
  const initWebSocket = useSwarmStore((s) => s.initWebSocket)

  const loadSessions = useSwarmStore((s) => s.loadSessions)
  const loadSettings = useSwarmStore((s) => s.loadSettings)
  const loadUIPreferences = useSwarmStore((s) => s.loadUIPreferences)
  const uiPreferencesLoading = useSwarmStore((s) => s.uiPreferencesLoading)
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const showPreview = useSwarmStore((s) => s.showPreview)
  const togglePreview = useSwarmStore((s) => s.togglePreview)

  useEffect(() => {
    initWebSocket()
    void (async () => {
      await loadUIPreferences()
      await Promise.all([loadSessions(), loadSettings()])
    })()
  }, [initWebSocket, loadSessions, loadSettings, loadUIPreferences])

  useEffect(() => {
    document.documentElement.dataset.themePreset = uiPreferences.themePreset
  }, [uiPreferences.themePreset])

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-background text-foreground"
      data-density={uiPreferences.density}
      data-font-scale={uiPreferences.fontScale}
      data-reduced-motion={uiPreferences.reducedMotion === true ? 'true' : 'false'}
      data-experience-level={uiPreferences.experienceLevel}
      data-theme-preset={uiPreferences.themePreset}
    >
      <GlobalProgress />
      <TopBar />
      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar />
        <main id="main-content" className="flex-1 flex flex-col overflow-hidden" tabIndex={-1}>
          {uiPreferencesLoading ? (
            <ChatViewFallback />
          ) : (
            <Suspense fallback={<ChatViewFallback />}>
              <ChatView />
            </Suspense>
          )}
        </main>
        {showPreview && (
          <aside className="hidden w-[420px] border-l border-border bg-card/40 p-3 lg:block">
            <LivePreview />
          </aside>
        )}
      </div>
      <SlidePanel
        open={showPreview}
        onClose={togglePreview}
        position="bottom"
        containerClassName="lg:hidden"
        ariaLabel="Live preview panel"
      >
        <div className="h-full p-3">
          <LivePreview />
        </div>
      </SlidePanel>
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
