import { cn } from '@/lib/utils'

type SpinnerSize = 'sm' | 'md' | 'lg'

interface SpinnerProps {
  size?: SpinnerSize
  className?: string
  label?: string
}

const sizeClasses: Record<SpinnerSize, { spinner: string; text: string }> = {
  sm: { spinner: 'h-4 w-4 border-2', text: 'text-xs' },
  md: { spinner: 'h-6 w-6 border-2', text: 'text-sm' },
  lg: { spinner: 'h-8 w-8 border-3', text: 'text-base' },
}

function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          sizeClasses[size].spinner
        )}
        role="status"
        aria-label={label || 'Loading'}
      />
      {label && (
        <span className={cn('text-muted', sizeClasses[size].text)}>
          {label}
        </span>
      )}
    </div>
  )
}

export { Spinner }
export type { SpinnerSize }
