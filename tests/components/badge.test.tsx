import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'
import { describe, it, expect } from 'vitest'

describe('Badge', () => {
  it('renders with text', () => {
    render(<Badge>Status</Badge>)
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders default variant', () => {
    render(<Badge variant="default">Default</Badge>)
    const badge = screen.getByText('Default')
    expect(badge).toHaveClass('bg-primary')
  })

  it('renders secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>)
    const badge = screen.getByText('Secondary')
    expect(badge).toHaveClass('bg-secondary')
  })

  it('renders destructive variant', () => {
    render(<Badge variant="destructive">Destructive</Badge>)
    const badge = screen.getByText('Destructive')
    expect(badge).toHaveClass('bg-destructive')
  })

  it('renders outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>)
    const badge = screen.getByText('Outline')
    expect(badge).toHaveClass('border-border')
  })

  it('applies custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>)
    const badge = screen.getByText('Custom')
    expect(badge).toHaveClass('custom-class')
  })

  it('renders children correctly', () => {
    render(
      <Badge>
        <span data-testid="child">Child Element</span>
      </Badge>
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('has correct base styles', () => {
    render(<Badge>Base</Badge>)
    const badge = screen.getByText('Base')
    expect(badge).toHaveClass('inline-flex', 'items-center', 'rounded-md')
  })

  it('has focus styles', () => {
    render(<Badge>Focus</Badge>)
    const badge = screen.getByText('Focus')
    expect(badge).toHaveClass('focus:outline-none', 'focus:ring-2')
  })

  it('renders multiple badges independently', () => {
    render(
      <>
        <Badge variant="default">First</Badge>
        <Badge variant="secondary">Second</Badge>
        <Badge variant="destructive">Third</Badge>
      </>
    )
    expect(screen.getByText('First')).toHaveClass('bg-primary')
    expect(screen.getByText('Second')).toHaveClass('bg-secondary')
    expect(screen.getByText('Third')).toHaveClass('bg-destructive')
  })
})
