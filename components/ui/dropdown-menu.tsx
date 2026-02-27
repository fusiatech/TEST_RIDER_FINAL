'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Accessible dropdown menu with WCAG 2.2 AA compliance:
 * - Arrow key navigation
 * - Escape to close
 * - Focus management
 * - Proper ARIA attributes
 */

interface DropdownMenuProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

interface DropdownMenuContentProps {
  children: React.ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
}

interface DropdownMenuItemProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

interface DropdownMenuSeparatorProps {
  className?: string
}

interface DropdownMenuState {
  open: boolean
  triggerRect: DOMRect | null
  focusedIndex: number
}

const DropdownMenuContext = React.createContext<{
  state: DropdownMenuState
  setState: React.Dispatch<React.SetStateAction<DropdownMenuState>>
  close: () => void
  triggerRef: React.RefObject<HTMLDivElement | null>
  menuId: string
  registerItem: (index: number, ref: HTMLButtonElement | null) => void
  itemRefs: React.MutableRefObject<Map<number, HTMLButtonElement>>
} | null>(null)

function useDropdownMenu() {
  const context = React.useContext(DropdownMenuContext)
  if (!context) {
    throw new Error('DropdownMenu components must be used within a DropdownMenu')
  }
  return context
}

export function DropdownMenu({ children, open: controlledOpen, onOpenChange }: DropdownMenuProps) {
  const [internalState, setInternalState] = React.useState<DropdownMenuState>({
    open: false,
    triggerRect: null,
    focusedIndex: -1,
  })
  
  const isControlled = controlledOpen !== undefined
  const state: DropdownMenuState = isControlled 
    ? { ...internalState, open: controlledOpen }
    : internalState
  
  const setState = React.useCallback((updater: React.SetStateAction<DropdownMenuState>) => {
    setInternalState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (isControlled && next.open !== prev.open) {
        onOpenChange?.(next.open)
      }
      return next
    })
  }, [isControlled, onOpenChange])
  
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const itemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map())
  const menuId = React.useId()

  const close = React.useCallback(() => {
    if (isControlled) {
      onOpenChange?.(false)
    }
    setInternalState((prev) => ({ ...prev, open: false, focusedIndex: -1 }))
  }, [isControlled, onOpenChange])

  const registerItem = React.useCallback((index: number, ref: HTMLButtonElement | null) => {
    if (ref) {
      itemRefs.current.set(index, ref)
    } else {
      itemRefs.current.delete(index)
    }
  }, [])

  React.useEffect(() => {
    if (state.open) {
      const handleClickOutside = (e: MouseEvent) => {
        if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
          close()
        }
      }
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
          const trigger = triggerRef.current?.querySelector('button')
          trigger?.focus()
        }
      }
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('click', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [state.open, close])

  return (
    <DropdownMenuContext.Provider value={{ state, setState, close, triggerRef, menuId, registerItem, itemRefs }}>
      <div ref={triggerRef} className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const { state, setState, triggerRef, menuId } = useDropdownMenu()

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = triggerRef.current?.getBoundingClientRect() ?? null
      setState((prev) => ({ open: !prev.open, triggerRect: rect, focusedIndex: prev.open ? -1 : 0 }))
    },
    [setState, triggerRef]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const rect = triggerRef.current?.getBoundingClientRect() ?? null
        setState({ open: true, triggerRect: rect, focusedIndex: 0 })
      }
    },
    [setState, triggerRef]
  )

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ 
      onClick?: React.MouseEventHandler
      onKeyDown?: React.KeyboardEventHandler
      'aria-haspopup'?: boolean
      'aria-expanded'?: boolean
      'aria-controls'?: string
    }>, {
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      'aria-haspopup': true,
      'aria-expanded': state.open,
      'aria-controls': menuId,
    })
  }

  return (
    <button 
      onClick={handleClick} 
      onKeyDown={handleKeyDown}
      type="button"
      aria-haspopup="menu"
      aria-expanded={state.open}
      aria-controls={menuId}
    >
      {children}
    </button>
  )
}

export function DropdownMenuContent({ children, className, align = 'start' }: DropdownMenuContentProps) {
  const { state, setState, close, menuId, itemRefs } = useDropdownMenu()
  const menuRef = React.useRef<HTMLDivElement>(null)

  const childArray = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child) && child.type === DropdownMenuItem
  )
  const itemCount = childArray.length

  React.useEffect(() => {
    if (state.open && state.focusedIndex >= 0) {
      const item = itemRefs.current.get(state.focusedIndex)
      item?.focus()
    }
  }, [state.open, state.focusedIndex, itemRefs])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setState((prev) => ({
            ...prev,
            focusedIndex: prev.focusedIndex < itemCount - 1 ? prev.focusedIndex + 1 : 0,
          }))
          break
        case 'ArrowUp':
          e.preventDefault()
          setState((prev) => ({
            ...prev,
            focusedIndex: prev.focusedIndex > 0 ? prev.focusedIndex - 1 : itemCount - 1,
          }))
          break
        case 'Home':
          e.preventDefault()
          setState((prev) => ({ ...prev, focusedIndex: 0 }))
          break
        case 'End':
          e.preventDefault()
          setState((prev) => ({ ...prev, focusedIndex: itemCount - 1 }))
          break
        case 'Tab':
          e.preventDefault()
          close()
          break
      }
    },
    [setState, close, itemCount]
  )

  if (!state.open) return null

  const alignmentClass = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  }[align]

  let itemIndex = 0
  const childrenWithIndex = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === DropdownMenuItem) {
      const index = itemIndex++
      return React.cloneElement(child as React.ReactElement<{ _index?: number }>, { _index: index })
    }
    return child
  })

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-orientation="vertical"
      className={cn(
        'absolute z-50 mt-1 min-w-[160px] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in-0 zoom-in-95',
        alignmentClass,
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {childrenWithIndex}
    </div>
  )
}

export function DropdownMenuItem({
  children,
  className,
  onClick,
  disabled,
  _index,
}: DropdownMenuItemProps & { _index?: number }) {
  const { close, registerItem } = useDropdownMenu()
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (_index !== undefined) {
      registerItem(_index, buttonRef.current)
      return () => registerItem(_index, null)
    }
  }, [_index, registerItem])

  const handleClick = React.useCallback(() => {
    if (disabled) return
    onClick?.()
    close()
  }, [disabled, onClick, close])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
  )

  return (
    <button
      ref={buttonRef}
      role="menuitem"
      tabIndex={-1}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-secondary focus:bg-secondary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      aria-disabled={disabled}
      type="button"
    >
      {children}
    </button>
  )
}

export function DropdownMenuSeparator({ className }: DropdownMenuSeparatorProps) {
  return <div role="separator" className={cn('-mx-1 my-1 h-px bg-border', className)} />
}
