'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this view right now.',
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/20 bg-card/40 px-4 py-10 text-center',
        className
      )}
    >
      <div className="rounded-full bg-destructive/10 p-3 animate-gradient-pulse">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
