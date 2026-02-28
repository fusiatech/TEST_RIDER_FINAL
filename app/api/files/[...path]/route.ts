import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeFilename } from '@/lib/sanitize'
import { getDefaultWorkspaceQuotaPolicy, getWorkspaceUsage } from '@/server/workspace-quotas'
import { areRawPathSegmentsSafe, sanitizeApiPathSegments, toApiRelativePath } from '@/server/files/path-normalization'
import { getSettings } from '@/server/storage'

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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const rawSegments = (await params).path
  const segments = sanitizeApiPathSegments(rawSegments)
  
  if (segments.length === 0 || !areRawPathSegmentsSafe(rawSegments)) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400 }
    )
  }
  
  const projectRoot = await getProjectPath()
  const filePath = path.join(projectRoot, ...segments)

  if (!isWithinProject(filePath, projectRoot)) {
    return NextResponse.json(
      { error: 'Path outside project directory' },
      { status: 403 }
    )
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return new NextResponse(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 404 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const rawSegments = (await params).path
  const segments = sanitizeApiPathSegments(rawSegments)
  
  if (segments.length === 0 || !areRawPathSegmentsSafe(rawSegments)) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400 }
    )
  }
  
  const projectRoot = await getProjectPath()
  const filePath = path.join(projectRoot, ...segments)

  if (!isWithinProject(filePath, projectRoot)) {
    return NextResponse.json(
      { error: 'Path outside project directory' },
      { status: 403 }
    )
  }

  try {
    const body = await request.text()
    const quota = getDefaultWorkspaceQuotaPolicy()
    const usage = getWorkspaceUsage(projectRoot)
    const exists = fs.existsSync(filePath)
    const currentSize = exists ? fs.statSync(filePath).size : 0
    const newSize = Buffer.byteLength(body, 'utf-8')
    const projectedFileCount = exists ? usage.fileCount : usage.fileCount + 1
    const projectedTotalBytes = usage.totalBytes - currentSize + newSize

    if (newSize > quota.maxFileSizeBytes) {
      return NextResponse.json(
        { error: `File exceeds per-file limit (${newSize} > ${quota.maxFileSizeBytes})` },
        { status: 413 }
      )
    }
    if (projectedFileCount > quota.maxFileCount) {
      return NextResponse.json(
        { error: `Workspace file-count quota exceeded (${projectedFileCount} > ${quota.maxFileCount})` },
        { status: 413 }
      )
    }
    if (projectedTotalBytes > quota.maxTotalBytes) {
      return NextResponse.json(
        { error: `Workspace storage quota exceeded (${projectedTotalBytes} > ${quota.maxTotalBytes})` },
        { status: 413 }
      )
    }

    fs.writeFileSync(filePath, body, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const rawSegments = (await params).path
  const segments = sanitizeApiPathSegments(rawSegments)
  
  if (segments.length === 0 || !areRawPathSegmentsSafe(rawSegments)) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400 }
    )
  }
  
  const projectRoot = await getProjectPath()
  const targetPath = path.join(projectRoot, ...segments)

  if (!isWithinProject(targetPath, projectRoot)) {
    return NextResponse.json(
      { error: 'Path outside project directory' },
      { status: 403 }
    )
  }

  try {
    const stat = fs.statSync(targetPath)
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(targetPath)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const rawSegments = (await params).path
  const segments = sanitizeApiPathSegments(rawSegments)
  
  if (segments.length === 0 || !areRawPathSegmentsSafe(rawSegments)) {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400 }
    )
  }
  
  const projectRoot = await getProjectPath()
  const oldPath = path.join(projectRoot, ...segments)

  if (!isWithinProject(oldPath, projectRoot)) {
    return NextResponse.json(
      { error: 'Path outside project directory' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { newName: rawNewName } = body as { newName: string }

    if (!rawNewName) {
      return NextResponse.json(
        { error: 'New name is required' },
        { status: 400 }
      )
    }

    const newName = sanitizeFilename(rawNewName)
    
    if (!newName || newName !== rawNewName) {
      return NextResponse.json(
        { error: 'Invalid name - contains disallowed characters' },
        { status: 400 }
      )
    }

    const newPath = path.join(path.dirname(oldPath), newName)

    if (!isWithinProject(newPath, projectRoot)) {
      return NextResponse.json(
        { error: 'Path outside project directory' },
        { status: 403 }
      )
    }

    if (fs.existsSync(newPath)) {
      return NextResponse.json(
        { error: 'A file or folder with that name already exists' },
        { status: 409 }
      )
    }

    fs.renameSync(oldPath, newPath)

    return NextResponse.json({
      ok: true,
      oldPath: toApiRelativePath(projectRoot, oldPath),
      newPath: toApiRelativePath(projectRoot, newPath),
      newName,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to rename'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
