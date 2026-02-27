import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      message,
      projectPath: requestedPath,
    } = body as {
      message?: string
      projectPath?: string
    }

    const commitMessage = message?.trim()
    if (!commitMessage) {
      return NextResponse.json({ error: 'Commit message is required' }, { status: 400 })
    }

    const resolved = resolvePathWithinWorkspace(requestedPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const result = await runGitCommand(['commit', '-m', commitMessage], resolved.path)
    if (result.code !== 0) {
      const errorText = `${result.stdout}\n${result.stderr}`
      if (errorText.includes('nothing to commit')) {
        return NextResponse.json({ error: 'Nothing to commit' }, { status: 400 })
      }
      return NextResponse.json(
        { error: result.stderr || 'Failed to commit' },
        { status: 500 },
      )
    }

    const commitMatch = result.stdout.match(/\[[\w/-]+\s+([a-f0-9]+)\]/i)
    const commitHash = commitMatch ? commitMatch[1] : null

    return NextResponse.json({
      ok: true,
      message: commitMessage,
      commitHash,
      output: result.stdout,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to commit'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
