'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Accessible context menu with WCAG 2.2 AA compliance:
 * - Arrow key navigation
 * - Escape to close
 * - Focus management
 * - Proper ARIA attributes
 */

interface ContextMenuProps {
  children: React.ReactNode
}

interface ContextMenuTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

interface ContextMenuContentProps {
  children: React.ReactNode
  className?: string
}

interface ContextMenuItemProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
  _index?: number
}

interface ContextMenuSeparatorProps {
  className?: string
}

interface ContextMenuState {
  open: boolean
  x: number
  y: number
  focusedIndex: number
}

const ContextMenuContext = React.createContext<{
  state: ContextMenuState
  setState: React.Dispatch<React.SetStateAction<ContextMenuState>>
  close: () => void
  menuId: string
  registerItem: (index: number, ref: HTMLButtonElement | null) => void
  itemRefs: React.MutableRefObject<Map<number, HTMLButtonElement>>
  triggerRef: React.RefObject<HTMLElement | null>
} | null>(null)

function useContextMenu() {
  const context = React.useContext(ContextMenuContext)
  if (!context) {
    throw new Error('ContextMenu components must be used within a ContextMenu')
  }
  return context
}

export function ContextMenu({ children }: ContextMenuProps) {
  const [state, setState] = React.useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    focusedIndex: -1,
  })
  const menuId = React.useId()
  const itemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map())
  const triggerRef = React.useRef<HTMLElement>(null)

  const close = React.useCallback(() => {
    setState((prev) => ({ ...prev, open: false, focusedIndex: -1 }))
    triggerRef.current?.focus()
  }, [])

  const registerItem = React.useCallback((index: number, ref: HTMLButtonElement | null) => {
    if (ref) {
      itemRefs.current.set(index, ref)
    } else {
      itemRefs.current.delete(index)
    }
  }, [])

  React.useEffect(() => {
    if (state.open) {
      const handleClick = () => close()
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }
      document.addEventListener('click', handleClick)
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('click', handleClick)
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [state.open, close])

  return (
    <ContextMenuContext.Provider value={{ state, setState, close, menuId, registerItem, itemRefs, triggerRef }}>
      {children}
    </ContextMenuContext.Provider>
  )
}

export function ContextMenuTrigger({ children, asChild }: ContextMenuTriggerProps) {
  const { setState, triggerRef } = useContextMenu()

  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setState({ open: true, x: e.clientX, y: e.clientY, focusedIndex: 0 })
    },
    [setState]
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault()
        const rect = (e.target as HTMLElement).getBoundingClientRect()
        setState({ open: true, x: rect.left, y: rect.bottom, focusedIndex: 0 })
      }
    },
    [setState]
  )

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ 
      onContextMenu?: React.MouseEventHandler
      onKeyDown?: React.KeyboardEventHandler
      ref?: React.Ref<HTMLElement>
    }>, {
      onContextMenu: handleContextMenu,
      onKeyDown: handleKeyDown,
      ref: triggerRef as React.Ref<HTMLElement>,
    })
  }

  return (
    <div 
      onContextMenu={handleContextMenu} 
      onKeyDown={handleKeyDown}
      ref={triggerRef as React.RefObject<HTMLDivElement>}
    >
      {children}
    </div>
  )
}

export function ContextMenuContent({ children, className }: ContextMenuContentProps) {
  const { state, setState, close, menuId, itemRefs } = useContextMenu()
  const menuRef = React.useRef<HTMLDivElement>(null)
  const [position, setPosition] = React.useState({ x: 0, y: 0 })

  const childArray = React.Children.toArray(children).filter(
    (child) => React.isValidElement(child) && child.type === ContextMenuItem
  )
  const itemCount = childArray.length

  React.useEffect(() => {
    if (state.open && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let x = state.x
      let y = state.y

      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 8
      }
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 8
      }

      setPosition({ x: Math.max(8, x), y: Math.max(8, y) })
    }
  }, [state.open, state.x, state.y])

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

  let itemIndex = 0
  const childrenWithIndex = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === ContextMenuItem) {
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
        'fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in-0 zoom-in-95',
        className
      )}
      style={{ left: position.x || state.x, top: position.y || state.y }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {childrenWithIndex}
    </div>
  )
}

export function ContextMenuItem({
  children,
  className,
  onClick,
  disabled,
  destructive,
  _index,
}: ContextMenuItemProps) {
  const { close, registerItem } = useContextMenu()
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
          : destructive
            ? 'text-red-500 hover:bg-red-500/10 focus:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-inset'
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

export function ContextMenuSeparator({ className }: ContextMenuSeparatorProps) {
  return <div role="separator" className={cn('-mx-1 my-1 h-px bg-border', className)} />
}
