'use client'

import { type ReactNode } from 'react'
import { ErrorBoundary } from './error-boundary'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RootErrorFallbackProps {
  error: Error
  resetError: () => void
}

function RootErrorFallback({ error, resetError }: RootErrorFallbackProps) {
  const handleGoHome = () => {
    window.location.href = '/'
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-8">
      <div className="flex flex-col items-center gap-6 max-w-lg text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            Application Error
          </h1>
          <p className="text-muted">
            SwarmUI encountered an unexpected error. This has been logged for investigation.
          </p>
        </div>

        <div className="w-full rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-mono text-destructive break-all">
            {error.name}: {error.message}
          </p>
          {error.stack && (
            <details className="mt-3">
              <summary className="text-xs text-muted cursor-pointer hover:text-foreground">
                Show stack trace
              </summary>
              <pre className="mt-2 text-[10px] text-muted overflow-auto max-h-40 whitespace-pre-wrap">
                {error.stack}
              </pre>
            </details>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="default"
            onClick={resetError}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          
          <Button
            variant="outline"
            onClick={handleGoHome}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Return Home
          </Button>
        </div>
      </div>
    </div>
  )
}

interface RootErrorBoundaryProps {
  children: ReactNode
}

export function RootErrorBoundary({ children }: RootErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={(props) => <RootErrorFallback {...props} />}
      onError={(error, errorInfo) => {
        console.error('[RootErrorBoundary] Application error:', error)
        console.error('[RootErrorBoundary] Component stack:', errorInfo.componentStack)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
