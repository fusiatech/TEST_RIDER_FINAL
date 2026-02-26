import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

interface FileEntry {
  name: string
  type: 'file' | 'directory'
  path: string
}

const BLOCKED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  '.turbo',
  '.vercel',
])

function getProjectPath(): string {
  return process.env.PROJECT_PATH ?? process.cwd()
}

function isWithinProject(targetPath: string, projectRoot: string): boolean {
  const resolved = path.resolve(targetPath)
  const root = path.resolve(projectRoot)
  return resolved === root || resolved.startsWith(root + path.sep)
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const dirPath = searchParams.get('path')
  const projectRoot = getProjectPath()

  const target = dirPath ? path.resolve(projectRoot, dirPath) : projectRoot

  if (!isWithinProject(target, projectRoot)) {
    return NextResponse.json(
      { error: 'Path outside project directory' },
      { status: 403 }
    )
  }

  try {
    const entries = fs.readdirSync(target, { withFileTypes: true })
    const result: FileEntry[] = entries
      .filter((entry) => !BLOCKED_DIRS.has(entry.name) && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' as const : 'file' as const,
        path: path.relative(projectRoot, path.join(target, entry.name)),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(
      { error: 'Failed to read directory' },
      { status: 500 }
    )
  }
}
