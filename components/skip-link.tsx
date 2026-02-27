'use client'

import { useCallback } from 'react'

/**
 * Skip link component for keyboard navigation accessibility.
 * Allows users to skip directly to main content.
 * Gap ID: G-A11Y-01 (Keyboard Navigation)
 * WCAG 2.2 AA compliant - visible on focus with proper focus management
 */
export function SkipLink() {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const mainContent = document.getElementById('main-content')
    if (mainContent) {
      mainContent.focus()
      mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const mainContent = document.getElementById('main-content')
      if (mainContent) {
        mainContent.focus()
        mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [])

  return (
    <a
      href="#main-content"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="
        sr-only
        focus:not-sr-only
        focus:fixed
        focus:top-4
        focus:left-4
        focus:z-100
        focus:px-4
        focus:py-3
        focus:bg-primary
        focus:text-white
        focus:rounded-lg
        focus:shadow-lg
        focus:outline-none
        focus:ring-2
        focus:ring-white
        focus:ring-offset-2
        focus:ring-offset-primary
        focus:font-medium
        focus:text-sm
        transition-all
        duration-200
      "
    >
      Skip to main content
    </a>
  )
}
