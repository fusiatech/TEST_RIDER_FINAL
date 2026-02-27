'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  icon?: React.ReactNode
}

export type EmptyStateVariant = 'default' | 'compact' | 'large'

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  variant?: EmptyStateVariant
  className?: string
}

const variantStyles: Record<EmptyStateVariant, {
  container: string
  iconWrapper: string
  iconSize: string
  title: string
  description: string
}> = {
  compact: {
    container: 'py-6',
    iconWrapper: 'h-10 w-10',
    iconSize: '[&_svg]:h-5 [&_svg]:w-5',
    title: 'mt-3 text-sm font-medium',
    description: 'mt-1 max-w-xs text-xs',
  },
  default: {
    container: 'py-12',
    iconWrapper: 'h-14 w-14',
    iconSize: '[&_svg]:h-7 [&_svg]:w-7',
    title: 'mt-4 text-base font-semibold',
    description: 'mt-2 max-w-sm text-sm',
  },
  large: {
    container: 'py-20',
    iconWrapper: 'h-20 w-20',
    iconSize: '[&_svg]:h-10 [&_svg]:w-10',
    title: 'mt-6 text-lg font-semibold',
    description: 'mt-3 max-w-md text-base',
  },
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, title, description, action, secondaryAction, variant = 'default', className }, ref) => {
    const styles = variantStyles[variant]
    
    return (
      <div
        ref={ref}
        className={cn(
          'flex h-full flex-col items-center justify-center text-center animate-fade-in',
          styles.container,
          className
        )}
      >
        <div className={cn(
          'flex items-center justify-center rounded-full bg-muted/50 text-muted',
          styles.iconWrapper,
          styles.iconSize
        )}>
          {icon}
        </div>
        <h3 className={cn('text-foreground', styles.title)}>{title}</h3>
        {description && (
          <p className={cn('text-muted', styles.description)}>
            {description}
          </p>
        )}
        {(action || secondaryAction) && (
          <div className={cn(
            'flex items-center gap-2',
            variant === 'compact' ? 'mt-3' : variant === 'large' ? 'mt-6' : 'mt-4'
          )}>
            {action && (
              <Button
                size={variant === 'compact' ? 'sm' : 'default'}
                variant={action.variant ?? 'default'}
                onClick={action.onClick}
                className="gap-2"
              >
                {action.icon}
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                size={variant === 'compact' ? 'sm' : 'default'}
                variant={secondaryAction.variant ?? 'outline'}
                onClick={secondaryAction.onClick}
                className="gap-2"
              >
                {secondaryAction.icon}
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }
)
EmptyState.displayName = 'EmptyState'

export { EmptyState }
