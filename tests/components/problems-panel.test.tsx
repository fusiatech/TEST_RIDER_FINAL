import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProblemsPanel, ProblemsBadge, Problem } from '@/components/problems-panel'

describe('ProblemsPanel', () => {
  it('renders empty state when no problems', () => {
    render(<ProblemsPanel problems={[]} />)
    expect(screen.getByText(/no problems detected/i)).toBeInTheDocument()
  })

  it('displays total problem count in header', () => {
    const problems: Problem[] = [
      { file: 'a.ts', line: 1, column: 1, severity: 'error', message: 'Error 1' },
      { file: 'b.ts', line: 1, column: 1, severity: 'warning', message: 'Warning 1' },
    ]
    render(<ProblemsPanel problems={problems} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('groups problems by file', () => {
    const problems: Problem[] = [
      { file: 'src/app.ts', line: 1, column: 1, severity: 'error', message: 'Error 1' },
      { file: 'src/app.ts', line: 2, column: 1, severity: 'warning', message: 'Warning 1' },
    ]
    render(<ProblemsPanel problems={problems} />)
    expect(screen.getByText('app.ts')).toBeInTheDocument()
  })

  it('expands file group on click', () => {
    const problems: Problem[] = [
      { file: 'src/app.ts', line: 10, column: 5, severity: 'error', message: 'Type error here' },
    ]
    render(<ProblemsPanel problems={problems} />)
    
    const fileButton = screen.getByText('app.ts').closest('button')
    expect(fileButton).toBeInTheDocument()
    
    fireEvent.click(fileButton!)
    expect(screen.getByText('Type error here')).toBeInTheDocument()
    expect(screen.getByText(/Ln 10, Col 5/)).toBeInTheDocument()
  })

  it('calls onProblemClick when problem is clicked', () => {
    const onProblemClick = vi.fn()
    const problems: Problem[] = [
      { file: 'src/app.ts', line: 10, column: 5, severity: 'error', message: 'Click me' },
    ]
    render(<ProblemsPanel problems={problems} onProblemClick={onProblemClick} />)
    
    const fileButton = screen.getByText('app.ts').closest('button')
    fireEvent.click(fileButton!)
    
    const problemButton = screen.getByText('Click me').closest('button')
    fireEvent.click(problemButton!)
    
    expect(onProblemClick).toHaveBeenCalledWith(problems[0])
  })

  it('displays source when provided', () => {
    const problems: Problem[] = [
      { file: 'a.ts', line: 1, column: 1, severity: 'error', message: 'Error', source: 'typescript' },
    ]
    render(<ProblemsPanel problems={problems} />)
    
    const fileButton = screen.getByText('a.ts').closest('button')
    fireEvent.click(fileButton!)
    
    expect(screen.getByText(/\(typescript\)/)).toBeInTheDocument()
  })

  it('sorts files by error count (most errors first)', () => {
    const problems: Problem[] = [
      { file: 'few-errors.ts', line: 1, column: 1, severity: 'warning', message: 'Warning' },
      { file: 'many-errors.ts', line: 1, column: 1, severity: 'error', message: 'Error 1' },
      { file: 'many-errors.ts', line: 2, column: 1, severity: 'error', message: 'Error 2' },
    ]
    render(<ProblemsPanel problems={problems} />)
    
    const fileNames = screen.getAllByText(/\.ts$/)
    expect(fileNames[0]).toHaveTextContent('many-errors.ts')
    expect(fileNames[1]).toHaveTextContent('few-errors.ts')
  })

  it('applies custom className', () => {
    const { container } = render(<ProblemsPanel problems={[]} className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('ProblemsBadge', () => {
  it('returns null when no errors or warnings', () => {
    const { container } = render(<ProblemsBadge problems={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null for info-only problems', () => {
    const problems: Problem[] = [
      { file: 'a.ts', line: 1, column: 1, severity: 'info', message: 'Info' },
    ]
    const { container } = render(<ProblemsBadge problems={problems} />)
    expect(container.firstChild).toBeNull()
  })

  it('displays error count', () => {
    const problems: Problem[] = [
      { file: 'a.ts', line: 1, column: 1, severity: 'error', message: 'Error 1' },
      { file: 'b.ts', line: 1, column: 1, severity: 'error', message: 'Error 2' },
    ]
    render(<ProblemsBadge problems={problems} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('displays warning count', () => {
    const problems: Problem[] = [
      { file: 'a.ts', line: 1, column: 1, severity: 'warning', message: 'Warning 1' },
    ]
    render(<ProblemsBadge problems={problems} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('displays both error and warning counts', () => {
    const problems: Problem[] = [
      { file: 'a.ts', line: 1, column: 1, severity: 'error', message: 'Error' },
      { file: 'a.ts', line: 2, column: 1, severity: 'warning', message: 'Warning' },
    ]
    render(<ProblemsBadge problems={problems} />)
    const counts = screen.getAllByText('1')
    expect(counts).toHaveLength(2)
  })
})
