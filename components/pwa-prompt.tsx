'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import {
  Download,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react'
import {
  registerServiceWorker,
  setupInstallPrompt,
  promptInstall,
  applyUpdate,
  isOnline,
  isStandalone,
} from '@/lib/pwa'

export function PWAPrompt() {
  const [showInstall, setShowInstall] = useState(false)
  const [showUpdate, setShowUpdate] = useState(false)
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    registerServiceWorker()
    setupInstallPrompt()

    setOffline(!isOnline())

    const handleInstallAvailable = () => {
      if (!isStandalone()) {
        setShowInstall(true)
      }
    }

    const handleUpdateAvailable = () => {
      setShowUpdate(true)
    }

    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)

    window.addEventListener('swarmui:install-available', handleInstallAvailable)
    window.addEventListener('swarmui:update-available', handleUpdateAvailable)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('swarmui:install-available', handleInstallAvailable)
      window.removeEventListener('swarmui:update-available', handleUpdateAvailable)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    const accepted = await promptInstall()
    if (accepted) {
      setShowInstall(false)
    }
  }, [])

  const handleUpdate = useCallback(() => {
    applyUpdate()
  }, [])

  const handleDismiss = useCallback(() => {
    setShowInstall(false)
    setDismissed(true)
  }, [])

  if (dismissed && !showUpdate && !offline) {
    return null
  }

  return (
    <>
      {showInstall && !dismissed && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Download className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Install Fusia AI</p>
              <p className="text-xs text-muted">Add to home screen for quick access</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={handleInstall}>
                Install
              </Button>
            </div>
          </div>
        </div>
      )}

      {showUpdate && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300 md:left-auto md:right-4">
          <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 shadow-lg backdrop-blur">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
              <RefreshCw className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Update Available</p>
              <p className="text-xs text-muted">A new version of Fusia AI is ready</p>
            </div>
            <Button size="sm" onClick={handleUpdate}>
              Update
            </Button>
          </div>
        </div>
      )}

      {offline && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 shadow-lg backdrop-blur">
            <WifiOff className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-500">Offline Mode</span>
          </div>
        </div>
      )}
    </>
  )
}

export function OfflineIndicator() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    setOffline(!isOnline())

    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!offline) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-2.5 py-1">
      <WifiOff className="h-3.5 w-3.5 text-yellow-500" />
      <span className="text-xs font-medium text-yellow-500">Offline</span>
    </div>
  )
}
