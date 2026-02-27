'use client'

import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ErrorFallbackProps {
  error: Error
  resetError: () => void
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const handleGoHome = () => {
    window.location.href = '/'
  }

  const handleReportBug = () => {
    const subject = encodeURIComponent(`Bug Report: ${error.name}`)
    const body = encodeURIComponent(
      `Error: ${error.message}\n\nStack trace:\n${error.stack || 'Not available'}\n\nSteps to reproduce:\n1. \n2. \n3. `
    )
    window.open(`mailto:support@example.com?subject=${subject}&body=${body}`)
  }

  return (
    <div className="flex min-h-[400px] w-full flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Something went wrong
          </h2>
          <p className="text-sm text-muted">
            An unexpected error occurred. You can try again or return to the home page.
          </p>
        </div>

        <div className="w-full rounded-lg border border-border bg-card/50 p-4">
          <p className="text-xs font-mono text-destructive break-all">
            {error.name}: {error.message}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={resetError}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoHome}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleReportBug}
            className="gap-2 text-muted hover:text-foreground"
          >
            <Bug className="h-4 w-4" />
            Report Bug
          </Button>
        </div>
      </div>
    </div>
  )
}

export function MinimalErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center p-4 rounded-lg border border-destructive/20 bg-destructive/5">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
        <span className="text-sm text-destructive">{error.message}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetError}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    </div>
  )
}
