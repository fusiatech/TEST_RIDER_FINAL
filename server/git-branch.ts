import { runGitCommand } from '@/server/git-command'

const FORBIDDEN_BRANCH_PATTERNS = [
  /\.\./,
  /\/$/,
  /^\/|\/\//,
  /@\{/,
  /[~^:?*\[\]\\]/,
  /\.lock$/,
  /\s/,
]

export interface BranchValidationResult {
  valid: boolean
  error?: string
  normalized?: string
}

export async function validateBranchName(
  branchName: string,
  cwd: string,
): Promise<BranchValidationResult> {
  const normalized = branchName.trim()
  if (!normalized) {
    return { valid: false, error: 'Branch name is required' }
  }

  if (normalized !== branchName) {
    return {
      valid: false,
      error: 'Branch name must not include leading/trailing whitespace',
    }
  }

  for (const pattern of FORBIDDEN_BRANCH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, error: 'Branch name contains invalid characters' }
    }
  }

  const check = await runGitCommand(
    ['check-ref-format', '--branch', normalized],
    cwd,
  )

  if (check.code !== 0) {
    return {
      valid: false,
      error: check.stderr.trim() || 'Invalid branch name format',
    }
  }

  return { valid: true, normalized }
}
