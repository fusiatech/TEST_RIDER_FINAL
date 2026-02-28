'use client'

import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface OfflineStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function OfflineState({
  title = 'You appear to be offline',
  description = 'Reconnect to refresh this data.',
  onRetry,
  className,
}: OfflineStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/40 px-4 py-10 text-center',
        className
      )}
    >
      <div className="rounded-full bg-secondary p-3 animate-gradient-pulse">
        <WifiOff className="h-6 w-6 text-muted" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
