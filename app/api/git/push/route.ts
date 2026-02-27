import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectPath: requestedPath,
      setUpstream,
      branch,
    } = body as {
      projectPath?: string
      setUpstream?: boolean
      branch?: string
    }

    const resolved = resolvePathWithinWorkspace(requestedPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const args = setUpstream && branch
      ? ['push', '-u', 'origin', branch]
      : ['push']

    const result = await runGitCommand(args, resolved.path)
    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.stderr || 'Failed to push' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      output: result.stdout || result.stderr,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to push'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
