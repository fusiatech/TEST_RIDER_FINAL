import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

export interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const requestedPath = searchParams.get('path')
  const resolved = resolvePathWithinWorkspace(requestedPath)

  if (!resolved.ok || !resolved.path) {
    return NextResponse.json(
      { error: resolved.error ?? 'Path outside workspace root' },
      { status: 403 },
    )
  }

  const cwd = resolved.path

  try {
    const result = await runGitCommand(
      ['stash', 'list', '--format=%gd|%gs|%ci'],
      cwd,
    )

    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.stderr || 'Failed to list stashes' },
        { status: 500 },
      )
    }

    const stashes: StashEntry[] = result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line, index) => {
        const parts = line.split('|')
        const message = parts[1] || ''
        const date = parts[2] || ''
        const branchMatch = message.match(/(?:WIP on|On) ([^:]+):/)
        return {
          index,
          message: message.replace(/(?:WIP on|On) [^:]+:\s*/, '').trim() || 'No message',
          branch: branchMatch ? branchMatch[1] : 'unknown',
          date,
        }
      })

    return NextResponse.json(stashes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list stashes'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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

    const resolved = resolvePathWithinWorkspace(requestedPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const args = ['stash', 'push']
    if (message?.trim()) {
      args.push('-m', message.trim())
    }

    const result = await runGitCommand(args, resolved.path)

    if (result.code !== 0) {
      const errorText = `${result.stdout}\n${result.stderr}`
      if (errorText.includes('No local changes to save')) {
        return NextResponse.json({ error: 'No local changes to stash' }, { status: 400 })
      }
      return NextResponse.json(
        { error: result.stderr || 'Failed to create stash' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      message: message?.trim() || 'Stash created',
      output: result.stdout,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create stash'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
