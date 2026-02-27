import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '@/components/ui/empty-state'
import { describe, it, expect, vi } from 'vitest'

const TestIcon = () => <svg data-testid="test-icon" />

describe('EmptyState', () => {
  it('renders with required props', () => {
    render(<EmptyState icon={<TestIcon />} title="No items" />)
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        description="Add some items to get started"
      />
    )
    expect(screen.getByText('Add some items to get started')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        action={{ label: 'Add Item', onClick }}
      />
    )
    const button = screen.getByRole('button', { name: 'Add Item' })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })

  it('renders secondary action when provided', () => {
    const primaryClick = vi.fn()
    const secondaryClick = vi.fn()
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        action={{ label: 'Primary', onClick: primaryClick }}
        secondaryAction={{ label: 'Secondary', onClick: secondaryClick }}
      />
    )
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
    
    fireEvent.click(screen.getByRole('button', { name: 'Secondary' }))
    expect(secondaryClick).toHaveBeenCalled()
  })

  it('renders compact variant', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        variant="compact"
        data-testid="empty-state"
      />
    )
    const container = screen.getByTestId('empty-state')
    expect(container).toHaveClass('py-6')
  })

  it('renders default variant', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        variant="default"
        data-testid="empty-state"
      />
    )
    const container = screen.getByTestId('empty-state')
    expect(container).toHaveClass('py-12')
  })

  it('renders large variant', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        variant="large"
        data-testid="empty-state"
      />
    )
    const container = screen.getByTestId('empty-state')
    expect(container).toHaveClass('py-20')
  })

  it('applies custom className', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        className="custom-class"
        data-testid="empty-state"
      />
    )
    expect(screen.getByTestId('empty-state')).toHaveClass('custom-class')
  })

  it('renders action with custom variant', () => {
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        action={{ label: 'Destructive Action', onClick, variant: 'destructive' }}
      />
    )
    const button = screen.getByRole('button', { name: 'Destructive Action' })
    expect(button).toHaveClass('bg-destructive')
  })

  it('renders action with icon', () => {
    const ActionIcon = () => <svg data-testid="action-icon" />
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        action={{
          label: 'Add',
          onClick: vi.fn(),
          icon: <ActionIcon />,
        }}
      />
    )
    expect(screen.getByTestId('action-icon')).toBeInTheDocument()
  })

  it('renders small buttons in compact variant', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        variant="compact"
        action={{ label: 'Add', onClick: vi.fn() }}
      />
    )
    const button = screen.getByRole('button', { name: 'Add' })
    expect(button).toHaveClass('h-8')
  })

  it('has correct base styles', () => {
    render(
      <EmptyState
        icon={<TestIcon />}
        title="No items"
        data-testid="empty-state"
      />
    )
    const container = screen.getByTestId('empty-state')
    expect(container).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center', 'text-center')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<EmptyState ref={ref} icon={<TestIcon />} title="No items" />)
    expect(ref).toHaveBeenCalled()
  })
})
