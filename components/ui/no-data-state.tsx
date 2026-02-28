'use client'

import { DatabaseZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NoDataStateProps {
  title?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function NoDataState({
  title = 'No data available',
  description = 'There is nothing to show for the selected filters yet.',
  actionLabel,
  onAction,
  className,
}: NoDataStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/40 px-4 py-10 text-center',
        className
      )}
    >
      <div className="rounded-full bg-secondary p-3 animate-gradient-pulse">
        <DatabaseZap className="h-6 w-6 text-muted" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      {onAction && actionLabel ? (
        <Button variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
