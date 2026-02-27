import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const filePath = searchParams.get('file')
  const staged = searchParams.get('staged') === 'true'
  const requestedPath = searchParams.get('path')

  if (!filePath) {
    return NextResponse.json({ error: 'File path is required' }, { status: 400 })
  }

  const resolved = resolvePathWithinWorkspace(requestedPath)
  if (!resolved.ok || !resolved.path) {
    return NextResponse.json(
      { error: resolved.error ?? 'Path outside workspace root' },
      { status: 403 },
    )
  }

  try {
    const args = staged
      ? ['diff', '--cached', '--', filePath]
      : ['diff', '--', filePath]

    const result = await runGitCommand(args, resolved.path)
    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.stderr || 'Failed to get diff' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      diff: result.stdout,
      file: filePath,
      staged,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get diff'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
