import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

type StageAction = 'stage' | 'unstage' | 'stage-all' | 'unstage-all'

function normalizeFiles(files: unknown): string[] {
  if (!Array.isArray(files)) return []
  return files.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      files,
      action,
      projectPath: requestedPath,
    } = body as {
      files?: unknown
      action?: StageAction
      projectPath?: string
    }

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    const resolved = resolvePathWithinWorkspace(requestedPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const fileList = normalizeFiles(files)
    let args: string[]

    switch (action) {
      case 'stage':
        if (fileList.length === 0) {
          return NextResponse.json({ error: 'No files specified' }, { status: 400 })
        }
        args = ['add', '--', ...fileList]
        break
      case 'unstage':
        if (fileList.length === 0) {
          return NextResponse.json({ error: 'No files specified' }, { status: 400 })
        }
        args = ['reset', 'HEAD', '--', ...fileList]
        break
      case 'stage-all':
        args = ['add', '-A']
        break
      case 'unstage-all':
        args = ['reset', 'HEAD']
        break
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const result = await runGitCommand(args, resolved.path)
    if (result.code !== 0) {
      return NextResponse.json(
        { error: result.stderr || 'Failed to stage/unstage files' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, action, files: fileList })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to stage/unstage files'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
