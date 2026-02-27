'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  contentClassName?: string
  delayMs?: number
}

export function Tooltip({
  content,
  children,
  side = 'top',
  className,
  contentClassName,
  delayMs = 200,
}: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const [position, setPosition] = React.useState({ top: 0, left: 0 })
  const triggerRef = React.useRef<HTMLSpanElement>(null)
  const tooltipRef = React.useRef<HTMLDivElement>(null)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const showTooltip = React.useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delayMs)
  }, [delayMs])

  const hideTooltip = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
  }, [])

  React.useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()

      let top = 0
      let left = 0

      switch (side) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - 8
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
          break
        case 'bottom':
          top = triggerRect.bottom + 8
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
          break
        case 'left':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
          left = triggerRect.left - tooltipRect.width - 8
          break
        case 'right':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
          left = triggerRect.right + 8
          break
      }

      left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8))
      top = Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8))

      setPosition({ top, left })
    }
  }, [isVisible, side])

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <span
        ref={triggerRef}
        className={cn('inline-flex cursor-help', className)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </span>
      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={cn(
            'fixed z-50 px-3 py-2 text-xs font-medium text-foreground bg-popover border border-border rounded-md shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            'max-w-xs',
            contentClassName
          )}
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {content}
        </div>
      )}
    </>
  )
}

export interface InfoTooltipProps {
  term: string
  description: string
  className?: string
}

export function InfoTooltip({ term, description, className }: InfoTooltipProps) {
  return (
    <Tooltip content={description} className={className}>
      <span className="border-b border-dotted border-muted-foreground/50 hover:border-primary transition-colors">
        {term}
      </span>
    </Tooltip>
  )
}

export const TERM_DEFINITIONS = {
  PRD: 'Product Requirements Document - A detailed description of what the project should do and why. Think of it as the blueprint for your project.',
  Confidence: 'How certain the AI is about this output (0-100%). Higher numbers mean the AI is more sure about the result.',
  Worktree: 'A separate copy of your code where changes can be made safely without affecting the main project.',
  Epic: 'A large feature or goal that gets broken down into smaller, manageable tasks. Like a chapter in a book.',
  Blocked: 'This task cannot start until other tasks it depends on are finished first.',
  Complexity: 'How much work a task requires: S (quick task), M (a few hours), L (a day or more), XL (significant effort)',
  Backlog: 'Tasks waiting to be started. These are planned but not yet being worked on.',
  InProgress: 'Tasks currently being worked on by the AI agents.',
  Review: 'Tasks that are done but need someone to check and approve the work.',
  Done: 'Tasks that have been completed and approved.',
  Rejected: 'Tasks that were reviewed but need changes before they can be approved.',
  PassRate: 'The percentage of tests that passed. Higher is better - 100% means all tests passed.',
  Coverage: 'How much of your code is tested. Higher coverage means more of your code has been verified.',
  Pipeline: 'The sequence of steps the AI follows: research, plan, code, validate, secure, and combine results.',
  Agent: 'An AI helper that specializes in a specific task like researching, coding, or testing.',
  Validator: 'An AI agent that checks if the code works correctly and follows best practices.',
  Synthesizer: 'An AI agent that combines results from other agents into a final answer.',
} as const
