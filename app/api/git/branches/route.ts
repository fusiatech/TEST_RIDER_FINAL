import { NextRequest, NextResponse } from 'next/server'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { runGitCommand } from '@/server/git-command'
import { validateBranchName } from '@/server/git-branch'

export interface GitBranch {
  name: string
  upstream: string | null
  current: boolean
  isRemote: boolean
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cwd = searchParams.get('cwd') || searchParams.get('path')

  const resolved = resolvePathWithinWorkspace(cwd)
  if (!resolved.ok || !resolved.path) {
    return NextResponse.json({ error: resolved.error || 'Invalid path' }, { status: 400 })
  }

  try {
    const branchList = await runGitCommand(
      ['branch', '-a', '--format=%(refname:short)|%(upstream:short)|%(HEAD)'],
      resolved.path,
    )
    if (branchList.code !== 0) {
      throw new Error(branchList.stderr || 'Failed to list branches')
    }

    const branches: GitBranch[] = branchList.stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [name, upstream, head] = line.split('|')
        const isRemote = name.startsWith('remotes/') || name.startsWith('origin/')
        return {
          name: name.replace(/^remotes\//, ''),
          upstream: upstream || null,
          current: head === '*',
          isRemote,
        }
      })
      .filter((branch) => !branch.name.includes('HEAD'))

    const currentBranchResult = await runGitCommand(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      resolved.path,
    )
    if (currentBranchResult.code !== 0) {
      throw new Error(currentBranchResult.stderr || 'Failed to get current branch')
    }

    return NextResponse.json({
      branches,
      currentBranch: currentBranchResult.stdout.trim(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list branches'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, checkout, cwd, baseBranch } = body as {
      name: string
      checkout?: boolean
      cwd?: string
      baseBranch?: string
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
    }

    const resolved = resolvePathWithinWorkspace(cwd)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json({ error: resolved.error || 'Invalid path' }, { status: 400 })
    }

    const nameValidation = await validateBranchName(name, resolved.path)
    if (!nameValidation.valid || !nameValidation.normalized) {
      return NextResponse.json(
        { error: nameValidation.error ?? 'Invalid branch name' },
        { status: 400 }
      )
    }

    let validatedBaseBranch: string | undefined
    if (baseBranch) {
      const baseValidation = await validateBranchName(baseBranch, resolved.path)
      if (!baseValidation.valid || !baseValidation.normalized) {
        return NextResponse.json(
          { error: baseValidation.error ?? 'Invalid base branch name' },
          { status: 400 }
        )
      }
      validatedBaseBranch = baseValidation.normalized
    }

    const args = checkout
      ? ['checkout', '-b', nameValidation.normalized, ...(validatedBaseBranch ? [validatedBaseBranch] : [])]
      : ['branch', nameValidation.normalized, ...(validatedBaseBranch ? [validatedBaseBranch] : [])]

    const createResult = await runGitCommand(args, resolved.path)
    if (createResult.code !== 0) {
      const errorMessage = createResult.stderr.trim() || 'Failed to create branch'
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: true, branch: nameValidation.normalized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create branch'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
