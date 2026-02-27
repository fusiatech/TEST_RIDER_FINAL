'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export type LoadingVariant = 'skeleton' | 'spinner' | 'dots'
export type LoadingSize = 'sm' | 'md' | 'lg'

export interface LoadingStateProps {
  variant?: LoadingVariant
  size?: LoadingSize
  text?: string
  className?: string
}

const sizeStyles: Record<LoadingSize, {
  spinner: string
  dot: string
  text: string
  skeleton: string
}> = {
  sm: {
    spinner: 'h-4 w-4',
    dot: 'h-1.5 w-1.5',
    text: 'text-xs',
    skeleton: 'h-4',
  },
  md: {
    spinner: 'h-6 w-6',
    dot: 'h-2 w-2',
    text: 'text-sm',
    skeleton: 'h-6',
  },
  lg: {
    spinner: 'h-8 w-8',
    dot: 'h-2.5 w-2.5',
    text: 'text-base',
    skeleton: 'h-8',
  },
}

function Spinner({ size = 'md', className }: { size?: LoadingSize; className?: string }) {
  return (
    <Loader2 
      className={cn(
        'animate-spin text-primary',
        sizeStyles[size].spinner,
        className
      )} 
    />
  )
}

function Dots({ size = 'md', className }: { size?: LoadingSize; className?: string }) {
  const dotSize = sizeStyles[size].dot
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cn(
            'rounded-full bg-primary animate-pulse-dot',
            dotSize
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

function Skeleton({ size = 'md', className }: { size?: LoadingSize; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn(
        'rounded-md bg-muted/50 animate-shimmer w-full',
        sizeStyles[size].skeleton
      )} />
      <div className={cn(
        'rounded-md bg-muted/50 animate-shimmer w-3/4',
        sizeStyles[size].skeleton
      )} />
      <div className={cn(
        'rounded-md bg-muted/50 animate-shimmer w-1/2',
        sizeStyles[size].skeleton
      )} />
    </div>
  )
}

const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ variant = 'spinner', size = 'md', text, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center gap-3',
          className
        )}
      >
        {variant === 'spinner' && <Spinner size={size} />}
        {variant === 'dots' && <Dots size={size} />}
        {variant === 'skeleton' && <Skeleton size={size} className="w-full max-w-xs" />}
        {text && (
          <p className={cn('text-muted', sizeStyles[size].text)}>
            {text}
          </p>
        )}
      </div>
    )
  }
)
LoadingState.displayName = 'LoadingState'

export { LoadingState, Spinner, Dots, Skeleton }
