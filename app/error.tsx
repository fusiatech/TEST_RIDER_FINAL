'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/error-state'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <ErrorState
        title="Unable to load this page"
        description="An unexpected application error occurred."
        onRetry={reset}
      />
    </div>
  )
}
