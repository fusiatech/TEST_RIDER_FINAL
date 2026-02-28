import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * InlineError is currently defined as a private function inside testing-dashboard.tsx.
 * This test file documents the expected behavior pattern for inline error components.
 * 
 * If InlineError is extracted to a shared component, update the import and tests accordingly.
 */

function InlineError({ 
  error, 
  onRetry 
}: { 
  error: string
  onRetry: () => void 
}) {
  return (
    <div 
      className="flex items-center gap-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20"
      role="alert"
      data-testid="inline-error"
    >
      <AlertCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
      <span className="text-sm text-foreground flex-1">{error}</span>
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
        Retry
      </Button>
    </div>
  )
}

describe('InlineError', () => {
  it('renders error message', () => {
    render(<InlineError error="Something went wrong" onRetry={() => {}} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('has alert role for accessibility', () => {
    render(<InlineError error="Error message" onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders retry button', () => {
    render(<InlineError error="Error" onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', () => {
    const onRetry = vi.fn()
    render(<InlineError error="Error" onRetry={onRetry} />)
    
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('displays error icon', () => {
    const { container } = render(<InlineError error="Error" onRetry={() => {}} />)
    const icon = container.querySelector('svg.text-destructive')
    expect(icon).toBeInTheDocument()
  })

  it('has proper styling classes', () => {
    render(<InlineError error="Error" onRetry={() => {}} />)
    const errorContainer = screen.getByTestId('inline-error')
    expect(errorContainer).toHaveClass('bg-destructive/10')
    expect(errorContainer).toHaveClass('border-destructive/20')
  })

  it('renders long error messages without truncation', () => {
    const longError = 'This is a very long error message that should not be truncated and should display fully to the user so they can understand what went wrong'
    render(<InlineError error={longError} onRetry={() => {}} />)
    expect(screen.getByText(longError)).toBeInTheDocument()
  })

  it('can be triggered multiple times', () => {
    const onRetry = vi.fn()
    render(<InlineError error="Error" onRetry={onRetry} />)
    
    const retryButton = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryButton)
    fireEvent.click(retryButton)
    fireEvent.click(retryButton)
    
    expect(onRetry).toHaveBeenCalledTimes(3)
  })
})

describe('InlineError accessibility', () => {
  it('error message is announced to screen readers', () => {
    render(<InlineError error="Network error occurred" onRetry={() => {}} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Network error occurred')
  })

  it('retry button is keyboard accessible', () => {
    const onRetry = vi.fn()
    render(<InlineError error="Error" onRetry={onRetry} />)
    
    const retryButton = screen.getByRole('button', { name: /retry/i })
    retryButton.focus()
    expect(document.activeElement).toBe(retryButton)
    
    fireEvent.keyDown(retryButton, { key: 'Enter' })
    expect(onRetry).toHaveBeenCalled()
  })
})
