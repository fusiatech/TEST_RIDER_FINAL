import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

const StageActionSchema = {
  isValidFiles(files: unknown): files is string[] {
    return (
      Array.isArray(files) &&
      files.length > 0 &&
      files.every((file) => typeof file === 'string' && file.length > 0)
    )
  },
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as {
      files?: unknown
      projectPath?: string
    }

    if (!StageActionSchema.isValidFiles(body.files)) {
      return NextResponse.json({ error: 'No files specified' }, { status: 400 })
    }

    const resolved = resolvePathWithinWorkspace(body.projectPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const result = await runGitCommand(
      ['restore', '--worktree', '--', ...body.files],
      resolved.path,
    )

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.stderr.trim() || result.stdout.trim() || 'Failed to discard changes' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true, files: body.files })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to discard changes'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
