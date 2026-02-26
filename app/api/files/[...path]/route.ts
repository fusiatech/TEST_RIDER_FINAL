import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

function getProjectPath(): string {
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
  const segments = (await params).path
  const projectRoot = getProjectPath()
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
  const segments = (await params).path
  const projectRoot = getProjectPath()
  const filePath = path.join(projectRoot, ...segments)

  if (!isWithinProject(filePath, projectRoot)) {
    return NextResponse.json(
      { error: 'Path outside project directory' },
      { status: 403 }
    )
  }

  try {
    const body = await request.text()
    fs.writeFileSync(filePath, body, 'utf-8')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'Failed to write file' },
      { status: 500 }
    )
  }
}
