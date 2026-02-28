'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export type LoadingVariant = 'skeleton' | 'spinner' | 'dots' | 'workflow'
export type LoadingSize = 'sm' | 'md' | 'lg'

export interface LoadingStateProps {
  variant?: LoadingVariant
  size?: LoadingSize
  text?: string
  steps?: string[]
  activeStep?: number
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

function Workflow({
  size = 'md',
  steps = [],
  activeStep = 0,
}: {
  size?: LoadingSize
  steps?: string[]
  activeStep?: number
}) {
  const orbSize = size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn('relative grid place-items-center', orbSize)}>
        <div className="absolute inset-0 rounded-full border border-primary/20 animate-spin-slow" />
        <div className="absolute inset-2 rounded-full border border-primary/50 border-t-primary animate-spin" />
        <div className="absolute inset-4 rounded-full bg-primary/15 animate-glow-pulse" />
        <div className="relative h-2.5 w-2.5 rounded-full bg-primary" />
      </div>

      {steps.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {steps.map((step, index) => (
            <span
              key={`${step}-${index}`}
              className={cn(
                'rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.08em] transition-colors',
                index <= activeStep
                  ? 'border-primary/50 bg-primary/12 text-foreground'
                  : 'border-border bg-card text-muted'
              )}
            >
              {step}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ variant = 'spinner', size = 'md', text, steps, activeStep = 0, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center gap-3',
          className
        )}
        role="status"
        aria-live="polite"
      >
        {variant === 'spinner' && <Spinner size={size} />}
        {variant === 'dots' && <Dots size={size} />}
        {variant === 'skeleton' && <Skeleton size={size} className="w-full max-w-xs" />}
        {variant === 'workflow' && <Workflow size={size} steps={steps} activeStep={activeStep} />}
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
