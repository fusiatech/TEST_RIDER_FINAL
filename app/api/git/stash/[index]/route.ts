import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

type StashAction = 'apply' | 'pop' | 'drop'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params
    const body = await request.json()
    const {
      action,
      projectPath: requestedPath,
    } = body as {
      action?: string
      projectPath?: string
    }

    if (!action || !['apply', 'pop', 'drop'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: apply, pop, drop' },
        { status: 400 },
      )
    }

    const stashIndex = parseInt(index, 10)
    if (isNaN(stashIndex) || stashIndex < 0) {
      return NextResponse.json(
        { error: 'Invalid stash index' },
        { status: 400 },
      )
    }

    const resolved = resolvePathWithinWorkspace(requestedPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const stashRef = `stash@{${stashIndex}}`
    const result = await runGitCommand(
      ['stash', action as StashAction, stashRef],
      resolved.path,
    )

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.stderr || `Failed to ${action} stash` },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      action,
      index: stashIndex,
      output: result.stdout,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to perform stash action'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
