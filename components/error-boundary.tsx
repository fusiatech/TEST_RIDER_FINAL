'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[#09090b] p-4">
          <Card className="w-full max-w-md border-zinc-800 bg-zinc-900">
            <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600/10">
                <AlertTriangle className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  Something went wrong
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  An unexpected error occurred. Please try again.
                </p>
              </div>
              {this.state.error && (
                <pre className="w-full overflow-auto rounded-lg bg-zinc-950 p-3 text-left text-xs text-red-400">
                  {this.state.error.message}
                </pre>
              )}
              <Button
                onClick={this.handleRetry}
                variant="outline"
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
