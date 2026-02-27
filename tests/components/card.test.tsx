import { render, screen } from '@testing-library/react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { describe, it, expect, vi } from 'vitest'

describe('Card', () => {
  it('renders correctly', () => {
    render(<Card data-testid="card">Card content</Card>)
    expect(screen.getByTestId('card')).toBeInTheDocument()
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<Card className="custom-class" data-testid="card" />)
    expect(screen.getByTestId('card')).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    render(<Card data-testid="card" />)
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('rounded-xl', 'border', 'shadow')
  })

  it('forwards ref correctly', () => {
    const ref = vi.fn()
    render(<Card ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })
})

describe('CardHeader', () => {
  it('renders correctly', () => {
    render(<CardHeader data-testid="header">Header content</CardHeader>)
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByText('Header content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<CardHeader className="custom-class" data-testid="header" />)
    expect(screen.getByTestId('header')).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    render(<CardHeader data-testid="header" />)
    expect(screen.getByTestId('header')).toHaveClass('flex', 'flex-col', 'p-6')
  })
})

describe('CardTitle', () => {
  it('renders correctly', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByText('Title')).toBeInTheDocument()
  })

  it('renders as h3', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<CardTitle className="custom-class">Title</CardTitle>)
    expect(screen.getByText('Title')).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    render(<CardTitle>Title</CardTitle>)
    expect(screen.getByText('Title')).toHaveClass('font-semibold', 'leading-none')
  })
})

describe('CardDescription', () => {
  it('renders correctly', () => {
    render(<CardDescription>Description</CardDescription>)
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<CardDescription className="custom-class">Description</CardDescription>)
    expect(screen.getByText('Description')).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    render(<CardDescription>Description</CardDescription>)
    expect(screen.getByText('Description')).toHaveClass('text-sm', 'text-muted')
  })
})

describe('CardContent', () => {
  it('renders correctly', () => {
    render(<CardContent data-testid="content">Content</CardContent>)
    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<CardContent className="custom-class" data-testid="content" />)
    expect(screen.getByTestId('content')).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    render(<CardContent data-testid="content" />)
    expect(screen.getByTestId('content')).toHaveClass('p-6', 'pt-0')
  })
})

describe('CardFooter', () => {
  it('renders correctly', () => {
    render(<CardFooter data-testid="footer">Footer</CardFooter>)
    expect(screen.getByTestId('footer')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<CardFooter className="custom-class" data-testid="footer" />)
    expect(screen.getByTestId('footer')).toHaveClass('custom-class')
  })

  it('has correct base styles', () => {
    render(<CardFooter data-testid="footer" />)
    expect(screen.getByTestId('footer')).toHaveClass('flex', 'items-center', 'p-6', 'pt-0')
  })
})

describe('Card composition', () => {
  it('renders full card with all components', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description text</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card body content</p>
        </CardContent>
        <CardFooter>
          <button>Action</button>
        </CardFooter>
      </Card>
    )

    expect(screen.getByTestId('card')).toBeInTheDocument()
    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Card description text')).toBeInTheDocument()
    expect(screen.getByText('Card body content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })
})
