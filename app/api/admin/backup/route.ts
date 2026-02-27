import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/permissions'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { checkDualRateLimit, ROUTE_RATE_LIMITS } from '@/lib/rate-limit'
import { auth } from '@/auth'

const BACKUP_VERSION = '1.0'
const BACKUP_DIR = process.env.BACKUP_DIR || './backups'
const DATA_FILE = process.env.DATA_FILE || './db.json'
const RATE_LIMIT_CONFIG = ROUTE_RATE_LIMITS['/api/admin']

interface BackupMetadata {
  version: string
  timestamp: string
  createdAt: number
  sourceFile: string
  checksum: string
  recordCounts: {
    sessions: number
    projects: number
    jobs: number
    scheduledTasks: number
    evidence: number
    testRuns: number
    extensions: number
    users: number
  }
}

interface BackupInfo {
  name: string
  path: string
  size: number
  createdAt: string
  metadata: BackupMetadata | null
}

function calculateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function getRecordCounts(data: Record<string, unknown[]>): BackupMetadata['recordCounts'] {
  return {
    sessions: Array.isArray(data.sessions) ? data.sessions.length : 0,
    projects: Array.isArray(data.projects) ? data.projects.length : 0,
    jobs: Array.isArray(data.jobs) ? data.jobs.length : 0,
    scheduledTasks: Array.isArray(data.scheduledTasks) ? data.scheduledTasks.length : 0,
    evidence: Array.isArray(data.evidence) ? data.evidence.length : 0,
    testRuns: Array.isArray(data.testRuns) ? data.testRuns.length : 0,
    extensions: Array.isArray(data.extensions) ? data.extensions.length : 0,
    users: Array.isArray(data.users) ? data.users.length : 0,
  }
}

async function applyRateLimit(request: NextRequest): Promise<{ response: NextResponse | null; headers: Headers }> {
  let userId: string | null = null
  try {
    const session = await auth()
    userId = session?.user?.id ?? null
  } catch {
    // Auth not available
  }

  const { success, headers, ipResult, userResult } = await checkDualRateLimit(
    request,
    RATE_LIMIT_CONFIG,
    userId
  )

  if (!success) {
    const effectiveResult = userResult && !userResult.success ? userResult : ipResult
    return {
      response: new NextResponse(
        JSON.stringify({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((effectiveResult.reset - Date.now()) / 1000)} seconds.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(headers.entries()),
          },
        }
      ),
      headers,
    }
  }
  return { response: null, headers }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageBackups')
  if (permissionError) return permissionError

  try {
    if (!existsSync(BACKUP_DIR)) {
      return NextResponse.json({ backups: [], total: 0 })
    }

    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .map((f): BackupInfo => {
        const filePath = join(BACKUP_DIR, f)
        const stats = statSync(filePath)
        let metadata: BackupMetadata | null = null

        try {
          const content = JSON.parse(readFileSync(filePath, 'utf-8'))
          metadata = content.metadata
        } catch {
          // Ignore parse errors
        }

        return {
          name: f,
          path: filePath,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
          metadata,
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const response = NextResponse.json({
      backups: files,
      total: files.length,
      backupDir: BACKUP_DIR,
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { response: rateLimitResponse, headers } = await applyRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  const permissionError = await requirePermission('canManageBackups')
  if (permissionError) return permissionError

  try {
    if (!existsSync(DATA_FILE)) {
      return NextResponse.json(
        { error: 'Database file not found' },
        { status: 404 }
      )
    }

    mkdirSync(BACKUP_DIR, { recursive: true })

    const rawData = readFileSync(DATA_FILE, 'utf-8')
    const data = JSON.parse(rawData) as Record<string, unknown[]>
    const checksum = calculateChecksum(rawData)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFileName = `backup-${timestamp}.json`
    const backupPath = join(BACKUP_DIR, backupFileName)

    const metadata: BackupMetadata = {
      version: BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      createdAt: Date.now(),
      sourceFile: DATA_FILE,
      checksum,
      recordCounts: getRecordCounts(data),
    }

    const backup = {
      version: BACKUP_VERSION,
      metadata,
      data,
    }

    writeFileSync(backupPath, JSON.stringify(backup, null, 2))

    const stats = statSync(backupPath)

    const response = NextResponse.json({
      success: true,
      backup: {
        name: backupFileName,
        path: backupPath,
        size: stats.size,
        createdAt: new Date().toISOString(),
        metadata,
      },
    }, { status: 201 })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
