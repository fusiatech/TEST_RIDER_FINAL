import { cn } from '@/lib/utils'

type SkeletonVariant = 'default' | 'text' | 'avatar' | 'card' | 'list'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  variant?: SkeletonVariant
  lines?: number
}

function Skeleton({ className, variant = 'default', lines = 3, ...props }: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'animate-pulse rounded-md bg-muted/20 h-4',
              i === lines - 1 ? 'w-3/4' : 'w-full'
            )}
          />
        ))}
      </div>
    )
  }

  if (variant === 'avatar') {
    return (
      <div
        className={cn('animate-pulse rounded-full bg-muted/20 h-10 w-10', className)}
        {...props}
      />
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn('animate-pulse rounded-xl border border-border bg-card/50 p-4 space-y-3', className)} {...props}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted/20" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-muted/20" />
            <div className="h-3 w-1/4 rounded bg-muted/20" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted/20" />
          <div className="h-4 w-5/6 rounded bg-muted/20" />
          <div className="h-4 w-2/3 rounded bg-muted/20" />
        </div>
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className={cn('space-y-3', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-muted/20 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-3/4 rounded bg-muted/20" />
              <div className="h-3 w-1/2 rounded bg-muted/20" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted/20', className)}
      {...props}
    />
  )
}

export { Skeleton }
export type { SkeletonVariant }
