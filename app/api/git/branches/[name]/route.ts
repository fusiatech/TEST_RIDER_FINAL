import { NextRequest, NextResponse } from 'next/server'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { runGitCommand } from '@/server/git-command'
import { validateBranchName } from '@/server/git-branch'

interface RouteParams {
  params: Promise<{ name: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
    const body = await request.json()
    const { action, cwd } = body as { action: 'checkout' | 'merge'; cwd?: string }

    if (!name) {
      return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
    }

    const resolved = resolvePathWithinWorkspace(cwd)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json({ error: resolved.error || 'Invalid path' }, { status: 400 })
    }

    const decodedName = decodeURIComponent(name)
    const nameValidation = await validateBranchName(decodedName, resolved.path)
    if (!nameValidation.valid || !nameValidation.normalized) {
      return NextResponse.json(
        { error: nameValidation.error ?? 'Invalid branch name' },
        { status: 400 }
      )
    }
    const normalizedName = nameValidation.normalized

    if (action === 'checkout') {
      const isRemote = normalizedName.startsWith('origin/')
      let args: string[]

      if (isRemote) {
        const localName = normalizedName.replace(/^origin\//, '')
        const localValidation = await validateBranchName(localName, resolved.path)
        if (!localValidation.valid || !localValidation.normalized) {
          return NextResponse.json(
            { error: localValidation.error ?? 'Invalid local branch name' },
            { status: 400 }
          )
        }

        const localExists = await runGitCommand(
          ['rev-parse', '--verify', localValidation.normalized],
          resolved.path,
        )
        args =
          localExists.code === 0
            ? ['checkout', localValidation.normalized]
            : ['checkout', '-b', localValidation.normalized, normalizedName]
      } else {
        args = ['checkout', normalizedName]
      }

      const checkoutResult = await runGitCommand(args, resolved.path)
      if (checkoutResult.code !== 0) {
        const errorMessage = checkoutResult.stderr.trim() || 'Branch checkout failed'
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }

      return NextResponse.json({ success: true, branch: normalizedName })
    }

    if (action === 'merge') {
      const mergeResult = await runGitCommand(['merge', normalizedName], resolved.path)
      if (mergeResult.code !== 0) {
        const errorMessage = mergeResult.stderr.trim() || 'Branch merge failed'
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }

      return NextResponse.json({ success: true, merged: normalizedName })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params
    const { searchParams } = new URL(request.url)
    const cwd = searchParams.get('cwd') || searchParams.get('path')
    const force = searchParams.get('force') === 'true'

    if (!name) {
      return NextResponse.json({ error: 'Branch name is required' }, { status: 400 })
    }

    const resolved = resolvePathWithinWorkspace(cwd)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json({ error: resolved.error || 'Invalid path' }, { status: 400 })
    }

    const decodedName = decodeURIComponent(name)
    const nameValidation = await validateBranchName(decodedName, resolved.path)
    if (!nameValidation.valid || !nameValidation.normalized) {
      return NextResponse.json(
        { error: nameValidation.error ?? 'Invalid branch name' },
        { status: 400 }
      )
    }
    const normalizedName = nameValidation.normalized

    const currentBranchResult = await runGitCommand(
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      resolved.path,
    )
    if (currentBranchResult.code !== 0) {
      const message = currentBranchResult.stderr.trim() || 'Failed to determine current branch'
      return NextResponse.json({ error: message }, { status: 400 })
    }
    const currentBranch = currentBranchResult.stdout.trim()

    if (currentBranch === normalizedName) {
      return NextResponse.json(
        { error: 'Cannot delete the currently checked out branch' },
        { status: 400 }
      )
    }

    const isRemote = normalizedName.startsWith('origin/')
    let args: string[]

    if (isRemote) {
      const remoteBranch = normalizedName.replace(/^origin\//, '')
      const remoteValidation = await validateBranchName(remoteBranch, resolved.path)
      if (!remoteValidation.valid || !remoteValidation.normalized) {
        return NextResponse.json(
          { error: remoteValidation.error ?? 'Invalid remote branch name' },
          { status: 400 }
        )
      }
      args = ['push', 'origin', '--delete', remoteValidation.normalized]
    } else {
      args = ['branch', force ? '-D' : '-d', normalizedName]
    }

    const deleteResult = await runGitCommand(args, resolved.path)
    if (deleteResult.code !== 0) {
      const errorMessage = deleteResult.stderr.trim() || 'Failed to delete branch'
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: true, deleted: normalizedName })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete branch'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
