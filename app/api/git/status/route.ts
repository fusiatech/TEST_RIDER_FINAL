import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied'
  staged: boolean
  oldPath?: string
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
  isRepo: boolean
}

function parseStatusCode(code: string): GitFileStatus['status'] {
  switch (code) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case '?': return 'untracked'
    default: return 'modified'
  }
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
    const isGitRepoResult = await runGitCommand(
      ['rev-parse', '--is-inside-work-tree'],
      cwd,
    )
    if (isGitRepoResult.code !== 0 || isGitRepoResult.stdout.trim() !== 'true') {
      return NextResponse.json({
        branch: '',
        ahead: 0,
        behind: 0,
        files: [],
        isRepo: false,
      } satisfies GitStatus)
    }

    const [branchResult, statusResult, aheadBehindResult] = await Promise.all([
      runGitCommand(['branch', '--show-current'], cwd),
      runGitCommand(['status', '--porcelain=v1'], cwd),
      runGitCommand(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], cwd),
    ])

    const branch = branchResult.code === 0
      ? (branchResult.stdout.trim() || 'HEAD')
      : 'HEAD'

    let behind = 0
    let ahead = 0
    if (aheadBehindResult.code === 0) {
      const [behindRaw, aheadRaw] = aheadBehindResult.stdout.trim().split('\t')
      behind = Number(behindRaw) || 0
      ahead = Number(aheadRaw) || 0
    }

    const files: GitFileStatus[] = []
    const lines = statusResult.stdout.split('\n').filter(Boolean)

    for (const line of lines) {
      const indexStatus = line[0]
      const workTreeStatus = line[1]
      const filePath = line.slice(3).trim()

      if (filePath.includes(' -> ')) {
        const [oldPath, newPath] = filePath.split(' -> ')
        if (indexStatus !== ' ' && indexStatus !== '?') {
          files.push({
            path: newPath,
            status: parseStatusCode(indexStatus),
            staged: true,
            oldPath,
          })
        }
        continue
      }

      if (indexStatus !== ' ' && indexStatus !== '?') {
        files.push({
          path: filePath,
          status: parseStatusCode(indexStatus),
          staged: true,
        })
      }
      if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        const existingStaged = files.find((f) => f.path === filePath && f.staged)
        if (!existingStaged || workTreeStatus !== indexStatus) {
          files.push({
            path: filePath,
            status: parseStatusCode(workTreeStatus),
            staged: false,
          })
        }
      }
      if (indexStatus === '?' && workTreeStatus === '?') {
        files.push({
          path: filePath,
          status: 'untracked',
          staged: false,
        })
      }
    }

    return NextResponse.json({
      branch,
      ahead,
      behind,
      files,
      isRepo: true,
    } satisfies GitStatus)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get git status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
