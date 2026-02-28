import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { canCreateFile, getDefaultWorkspaceQuotaPolicy } from '@/server/workspace-quotas'
import { toApiRelativePath } from '@/server/files/path-normalization'
import { getSettings } from '@/server/storage'

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

const FILES_RATE_LIMIT = { interval: 60_000, limit: 100 }

async function getProjectPath(): Promise<string> {
  try {
    const settings = await getSettings()
    const configuredPath = settings.projectPath?.trim()
    if (configuredPath && fs.existsSync(configuredPath)) {
      return configuredPath
    }
  } catch {
    // fallback to env/cwd
  }
  return process.env.PROJECT_PATH ?? process.cwd()
}

function isWithinProject(targetPath: string, projectRoot: string): boolean {
  const resolved = path.resolve(targetPath)
  const root = path.resolve(projectRoot)
  return resolved === root || resolved.startsWith(root + path.sep)
}

async function applyRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const identifier = getClientIdentifier(request)
  const { success, headers, result } = await checkRateLimit(
    new Request(request.url, {
      headers: new Headers([['x-forwarded-for', identifier]]),
    }),
    FILES_RATE_LIMIT
  )

  if (!success) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.reset - Date.now()) / 1000)} seconds.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(headers.entries()),
        },
      }
    )
  }
  return null
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse
  const searchParams = request.nextUrl.searchParams
  const dirPath = searchParams.get('path')
  const projectRoot = await getProjectPath()

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
        path: toApiRelativePath(projectRoot, path.join(target, entry.name)),
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

export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse
  const projectRoot = await getProjectPath()

  try {
    const body = await request.json()
    const { parentPath, name, type } = body as {
      parentPath?: string
      name: string
      type: 'file' | 'directory'
    }

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid name' },
        { status: 400 }
      )
    }

    const targetDir = parentPath
      ? path.resolve(projectRoot, parentPath)
      : projectRoot
    const targetPath = path.join(targetDir, name)

    if (!isWithinProject(targetPath, projectRoot)) {
      return NextResponse.json(
        { error: 'Path outside project directory' },
        { status: 403 }
      )
    }

    if (fs.existsSync(targetPath)) {
      return NextResponse.json(
        { error: 'File or folder already exists' },
        { status: 409 }
      )
    }

    if (type === 'directory') {
      fs.mkdirSync(targetPath, { recursive: true })
    } else {
      const quotaCheck = canCreateFile(projectRoot, 0, getDefaultWorkspaceQuotaPolicy())
      if (!quotaCheck.ok) {
        return NextResponse.json(
          { error: quotaCheck.reason, quota: quotaCheck.quota, usage: quotaCheck.usage },
          { status: 413 }
        )
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.writeFileSync(targetPath, '', 'utf-8')
    }

    return NextResponse.json({
      ok: true,
      path: toApiRelativePath(projectRoot, targetPath),
      name,
      type,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
