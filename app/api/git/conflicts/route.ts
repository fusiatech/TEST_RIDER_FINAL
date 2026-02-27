import { NextRequest, NextResponse } from 'next/server'
import { runGitCommand } from '@/server/git-command'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface ConflictFile {
  path: string
  ours: string
  theirs: string
  base: string
  merged: string
}

export interface ConflictsResponse {
  conflicts: ConflictFile[]
  inMerge: boolean
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
    const statusResult = await runGitCommand(['status', '--porcelain=v1'], cwd)
    
    if (statusResult.code !== 0) {
      return NextResponse.json({ conflicts: [], inMerge: false })
    }

    const lines = statusResult.stdout.split('\n').filter(Boolean)
    const conflictFiles: string[] = []
    
    for (const line of lines) {
      const indexStatus = line[0]
      const workTreeStatus = line[1]
      const filePath = line.slice(3).trim()
      
      if (
        (indexStatus === 'U' || workTreeStatus === 'U') ||
        (indexStatus === 'A' && workTreeStatus === 'A') ||
        (indexStatus === 'D' && workTreeStatus === 'D')
      ) {
        conflictFiles.push(filePath)
      }
    }

    if (conflictFiles.length === 0) {
      return NextResponse.json({ conflicts: [], inMerge: false })
    }

    const conflicts: ConflictFile[] = []
    
    for (const file of conflictFiles) {
      try {
        const [oursResult, theirsResult, baseResult] = await Promise.all([
          runGitCommand(['show', `:2:${file}`], cwd),
          runGitCommand(['show', `:3:${file}`], cwd),
          runGitCommand(['show', `:1:${file}`], cwd).catch(() => ({ code: 1, stdout: '', stderr: '' })),
        ])

        const filePath = path.join(cwd, file)
        let merged = ''
        try {
          merged = await fs.readFile(filePath, 'utf-8')
        } catch {
          merged = ''
        }

        conflicts.push({
          path: file,
          ours: oursResult.code === 0 ? oursResult.stdout : '',
          theirs: theirsResult.code === 0 ? theirsResult.stdout : '',
          base: baseResult.code === 0 ? baseResult.stdout : '',
          merged,
        })
      } catch {
        // File might be deleted in one branch, skip it
      }
    }

    return NextResponse.json({ conflicts, inMerge: conflicts.length > 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get conflicts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { file, resolution, projectPath } = body

    if (!file || typeof resolution !== 'string') {
      return NextResponse.json(
        { error: 'Missing file or resolution' },
        { status: 400 },
      )
    }

    const resolved = resolvePathWithinWorkspace(projectPath)

    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 },
      )
    }

    const cwd = resolved.path
    const filePath = path.join(cwd, file)

    // Verify the file path is within workspace
    const fileResolved = resolvePathWithinWorkspace(filePath)
    if (!fileResolved.ok) {
      return NextResponse.json(
        { error: 'File path outside workspace' },
        { status: 403 },
      )
    }

    // Write the resolved content
    await fs.writeFile(filePath, resolution, 'utf-8')

    // Stage the resolved file
    const stageResult = await runGitCommand(['add', file], cwd)
    
    if (stageResult.code !== 0) {
      return NextResponse.json(
        { error: `Failed to stage file: ${stageResult.stderr}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve conflict'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
