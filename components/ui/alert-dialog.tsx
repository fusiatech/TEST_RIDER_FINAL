'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Custom AlertDialog with accessibility improvements.
 * Gap ID: G-A11Y-01 (Focus Management)
 */

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

interface AlertDialogContentProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogHeaderProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogFooterProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogTitleProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogDescriptionProps {
  children: React.ReactNode
  className?: string
}

interface AlertDialogActionProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
}

interface AlertDialogCancelProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

const AlertDialogContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
  titleId: string
  descriptionId: string
} | null>(null)

function useAlertDialog() {
  const context = React.useContext(AlertDialogContext)
  if (!context) {
    throw new Error('AlertDialog components must be used within an AlertDialog')
  }
  return context
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (open) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onOpenChange(false)
      }
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onOpenChange])

  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange, titleId, descriptionId }}>
      {children}
    </AlertDialogContext.Provider>
  )
}

export function AlertDialogContent({ children, className }: AlertDialogContentProps) {
  const { open, onOpenChange, titleId, descriptionId } = useAlertDialog()
  const contentRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement
      const cancelButton = contentRef.current?.querySelector<HTMLElement>(
        '[data-cancel-button], button:last-of-type'
      )
      const focusableElements = contentRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (cancelButton) {
        cancelButton.focus()
      } else if (focusableElements && focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = contentRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusableElements || focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="fixed inset-0 bg-black/80 animate-in fade-in-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          ref={contentRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            'relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg animate-in fade-in-0 zoom-in-95',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function AlertDialogHeader({ children, className }: AlertDialogHeaderProps) {
  return (
    <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)}>
      {children}
    </div>
  )
}

export function AlertDialogFooter({ children, className }: AlertDialogFooterProps) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
    >
      {children}
    </div>
  )
}

export function AlertDialogTitle({ children, className }: AlertDialogTitleProps) {
  const { titleId } = useAlertDialog()
  return (
    <h2 id={titleId} className={cn('text-lg font-semibold', className)}>{children}</h2>
  )
}

export function AlertDialogDescription({ children, className }: AlertDialogDescriptionProps) {
  const { descriptionId } = useAlertDialog()
  return (
    <p id={descriptionId} className={cn('text-sm text-muted', className)}>{children}</p>
  )
}

export function AlertDialogAction({ children, className, onClick, variant = 'default' }: AlertDialogActionProps) {
  const { onOpenChange } = useAlertDialog()

  const handleClick = () => {
    onClick?.()
    onOpenChange(false)
  }

  return (
    <Button variant={variant} className={className} onClick={handleClick}>
      {children}
    </Button>
  )
}

export function AlertDialogCancel({ children, className, onClick }: AlertDialogCancelProps) {
  const { onOpenChange } = useAlertDialog()

  const handleClick = () => {
    onClick?.()
    onOpenChange(false)
  }

  return (
    <Button 
      variant="outline" 
      className={className} 
      onClick={handleClick}
      data-cancel-button
    >
      {children}
    </Button>
  )
}
