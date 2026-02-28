'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Menu, Eye, EyeOff, Keyboard, Settings, LogOut, User, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BrandLogo } from '@/components/brand-logo'
import { NotificationCenter } from '@/components/notification-center'
import { ThemeToggleCompact } from '@/components/theme-toggle'
import { useSwarmStore } from '@/lib/store'
import { USER_ROLE_LABELS } from '@/lib/types'
import { toast } from 'sonner'

export function TopBar() {
  const router = useRouter()
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const toggleSidebar = useSwarmStore((s) => s.toggleSidebar)
  const isRunning = useSwarmStore((s) => s.isRunning)
  const showPreview = useSwarmStore((s) => s.showPreview)
  const togglePreview = useSwarmStore((s) => s.togglePreview)
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const userId = session?.user?.id
  const shortId = userId ? `usr_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}` : null

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={toggleSidebar}
          aria-label="Toggle navigation menu"
          data-action-id="topbar-hamburger"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <BrandLogo className="h-8 shrink-0" />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={showPreview ? 'default' : 'outline'}
            size="sm"
            className="inline-flex gap-1.5"
            onClick={togglePreview}
            aria-label={showPreview ? 'Hide preview panel' : 'Show preview panel'}
            data-action-id="topbar-preview-toggle"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">Preview</span>
          </Button>

          <div data-action-id="topbar-notifications">
            <NotificationCenter />
          </div>

          <div data-action-id="topbar-theme-toggle">
            <ThemeToggleCompact />
          </div>

          {uiPreferences.keyboardHelpVisible && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.dispatchEvent(new CustomEvent('fusia:open-keyboard-shortcuts'))}
              aria-label="Open keyboard shortcuts"
              data-action-id="topbar-shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          )}

          <div className="relative" ref={menuRef}>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open profile menu"
              data-action-id="topbar-profile-menu"
            >
              <User className="h-4 w-4" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-popover p-2 shadow-xl">
                <div className="mb-2 rounded-lg border border-border/80 bg-card/60 p-2">
                  <p className="text-xs text-muted">Signed in as</p>
                  <p className="truncate text-sm font-medium">{session?.user?.email ?? 'Unknown user'}</p>
                  {uiPreferences.showAccountId && shortId && (
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1">
                      <span className="truncate font-mono text-[10px] text-muted">{shortId}</span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-foreground"
                        onClick={async () => {
                          if (!userId) return
                          try {
                            await navigator.clipboard.writeText(userId)
                            toast.success('Account ID copied')
                          } catch {
                            toast.error('Could not copy account ID')
                          }
                        }}
                        data-action-id="topbar-copy-user-id"
                      >
                        <Copy className="h-3 w-3" />
                        Copy ID
                      </button>
                    </div>
                  )}
                  <Badge className="mt-1" variant="secondary">
                    {USER_ROLE_LABELS[(session?.user?.role as 'admin' | 'editor' | 'viewer') ?? 'viewer']}
                  </Badge>
                </div>

                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setMenuOpen(false)
                    router.push('/settings')
                  }}
                  data-action-id="topbar-profile-settings"
                >
                  <Settings className="h-4 w-4" />
                  Profile Settings
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    setMenuOpen(false)
                    router.push('/settings?section=personalization')
                  }}
                  data-action-id="topbar-personalization"
                >
                  <User className="h-4 w-4" />
                  Personalization
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={() => {
                    setMenuOpen(false)
                    void signOut({ callbackUrl: '/login' })
                  }}
                  data-action-id="topbar-signout"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            )}
          </div>

          {isRunning && (
            <Badge className="hidden xl:inline-flex" variant="outline">
              Active run
            </Badge>
          )}
        </div>
      </div>
    </header>
  )
}
