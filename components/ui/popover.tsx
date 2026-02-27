'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function Popover({ open: controlledOpen, onOpenChange, children }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      {children}
    </PopoverContext.Provider>
  )
}

interface PopoverContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const PopoverContext = React.createContext<PopoverContextValue>({
  open: false,
  setOpen: () => {},
})

export function PopoverTrigger({
  children,
  asChild,
  className,
}: {
  children: React.ReactNode
  asChild?: boolean
  className?: string
}) {
  const { open, setOpen } = React.useContext(PopoverContext)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    PopoverTriggerRef.current = triggerRef.current
  })

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void; ref?: React.Ref<HTMLElement> }>, {
      onClick: () => setOpen(!open),
      ref: triggerRef as React.Ref<HTMLElement>,
    })
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      className={className}
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      {children}
    </button>
  )
}

const PopoverTriggerRef = { current: null as HTMLButtonElement | null }

export function PopoverContent({
  children,
  className,
  align = 'center',
  sideOffset = 4,
}: {
  children: React.ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}) {
  const { open, setOpen } = React.useContext(PopoverContext)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [position, setPosition] = React.useState({ top: 0, left: 0 })

  React.useEffect(() => {
    if (open && PopoverTriggerRef.current && contentRef.current) {
      const triggerRect = PopoverTriggerRef.current.getBoundingClientRect()
      const contentRect = contentRef.current.getBoundingClientRect()

      let left = triggerRect.left
      if (align === 'center') {
        left = triggerRect.left + (triggerRect.width - contentRect.width) / 2
      } else if (align === 'end') {
        left = triggerRect.right - contentRect.width
      }

      const top = triggerRect.bottom + sideOffset

      setPosition({
        top: Math.max(8, Math.min(top, window.innerHeight - contentRect.height - 8)),
        left: Math.max(8, Math.min(left, window.innerWidth - contentRect.width - 8)),
      })
    }
  }, [open, align, sideOffset])

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node) &&
        PopoverTriggerRef.current &&
        !PopoverTriggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      ref={contentRef}
      role="dialog"
      className={cn(
        'fixed z-50 w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none',
        'animate-in fade-in-0 zoom-in-95',
        className
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {children}
    </div>
  )
}
