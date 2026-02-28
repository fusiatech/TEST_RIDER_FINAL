'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SlidePanelPosition = 'right' | 'bottom'

interface SlidePanelProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  position?: SlidePanelPosition
  containerClassName?: string
  panelClassName?: string
  overlayClassName?: string
  ariaLabel?: string
}

export function SlidePanel({
  open,
  onClose,
  children,
  position = 'right',
  containerClassName,
  panelClassName,
  overlayClassName,
  ariaLabel = 'Panel',
}: SlidePanelProps) {
  const lastActiveElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastActiveElementRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = previousOverflow
      lastActiveElementRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const isBottom = position === 'bottom'

  return (
    <div className={cn('fixed inset-0 z-50', containerClassName)}>
      <button
        type="button"
        className={cn('absolute inset-0 bg-black/45 backdrop-blur-[1px]', overlayClassName)}
        aria-label="Close panel overlay"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          'absolute bg-background shadow-2xl',
          isBottom
            ? 'bottom-0 left-0 right-0 max-h-[78vh] rounded-t-2xl border-t border-border'
            : 'right-0 top-0 h-full w-full max-w-[430px] border-l border-border',
          panelClassName
        )}
      >
        {children}
      </section>
    </div>
  )
}
