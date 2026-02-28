'use client'

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
  onClick?: () => void
  path?: string
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1 text-xs text-muted', className)}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const isClickable = item.href || item.onClick

        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-1">
            {isClickable ? (
              <button
                onClick={item.onClick}
                className={cn(
                  'max-w-[120px] truncate transition-colors rounded px-1 -mx-1',
                  'hover:text-foreground hover:bg-secondary/50',
                  'cursor-pointer',
                  isLast && 'text-foreground font-medium'
                )}
                title={item.path || item.label}
              >
                {item.label}
              </button>
            ) : (
              <span
                className={cn(
                  'max-w-[120px] truncate',
                  isLast && 'text-foreground font-medium'
                )}
                title={item.path || item.label}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted/50" />
            )}
          </div>
        )
      })}
    </nav>
  )
}
