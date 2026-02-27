import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateBranchName } from '@/server/git-branch'
import { runGitCommand } from '@/server/git-command'

vi.mock('@/server/git-command', () => ({
  runGitCommand: vi.fn(),
}))

const mockRunGitCommand = vi.mocked(runGitCommand)

describe('git-branch validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunGitCommand.mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
    })
  })

  it('accepts a valid branch name', async () => {
    const result = await validateBranchName('feature/add-api', '/repo')
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe('feature/add-api')
    expect(mockRunGitCommand).toHaveBeenCalledWith(
      ['check-ref-format', '--branch', 'feature/add-api'],
      '/repo',
    )
  })

  it('rejects branch names with whitespace', async () => {
    const result = await validateBranchName(' feature ', '/repo')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('whitespace')
    expect(mockRunGitCommand).not.toHaveBeenCalled()
  })

  it('rejects branch names with forbidden characters', async () => {
    const result = await validateBranchName('feature:bad', '/repo')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('invalid characters')
    expect(mockRunGitCommand).not.toHaveBeenCalled()
  })

  it('rejects branch names that fail git check-ref-format', async () => {
    mockRunGitCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'fatal: invalid branch name',
    })

    const result = await validateBranchName('feature/.', '/repo')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('invalid branch name')
  })
})
