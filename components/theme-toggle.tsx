'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
] as const

function enableThemeTransition() {
  document.documentElement.classList.add('theme-transition')
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transition')
  }, 250)
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleThemeChange = useCallback((newTheme: string) => {
    if (newTheme === theme) return
    
    enableThemeTransition()
    setTheme(newTheme)
    setOpen(false)
    
    const label = THEME_OPTIONS.find((o) => o.value === newTheme)?.label ?? newTheme
    toast.success(`Theme changed to ${label}`, {
      duration: 2000,
      icon: newTheme === 'dark' ? <Moon className="h-4 w-4" /> : 
            newTheme === 'light' ? <Sun className="h-4 w-4" /> : 
            <Monitor className="h-4 w-4" />,
    })
  }, [theme, setTheme])

  if (!mounted) {
    return (
      <Button variant="ghost" className="w-full justify-start gap-2 text-muted" disabled aria-label="Toggle theme">
        <Moon className="h-4 w-4" />
        Theme
      </Button>
    )
  }

  const current = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[1]
  const CurrentIcon = current.Icon

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-muted hover:text-foreground"
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        <CurrentIcon className="h-5 w-5" />
        Theme
        <span className="ml-auto text-xs text-muted">{current.label}</span>
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-full rounded-lg border border-border bg-card p-1 shadow-lg animate-fade-in">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                theme === option.value
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted hover:bg-secondary hover:text-foreground'
              )}
            >
              <option.Icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ThemeToggleCompact() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9" disabled aria-label="Toggle theme">
        <Moon className="h-4.5 w-4.5" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  const cycleTheme = () => {
    enableThemeTransition()
    
    let newTheme: string
    if (theme === 'dark') {
      newTheme = 'light'
    } else if (theme === 'light') {
      newTheme = 'system'
    } else {
      newTheme = 'dark'
    }
    
    setTheme(newTheme)
    
    const label = THEME_OPTIONS.find((o) => o.value === newTheme)?.label ?? newTheme
    toast.success(`Theme changed to ${label}`, {
      duration: 2000,
      icon: newTheme === 'dark' ? <Moon className="h-4 w-4" /> : 
            newTheme === 'light' ? <Sun className="h-4 w-4" /> : 
            <Monitor className="h-4 w-4" />,
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted hover:text-foreground border border-border hover:border-primary/30 transition-colors"
      onClick={cycleTheme}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? (
        <Moon className="h-4.5 w-4.5" />
      ) : (
        <Sun className="h-4.5 w-4.5" />
      )}
    </Button>
  )
}
