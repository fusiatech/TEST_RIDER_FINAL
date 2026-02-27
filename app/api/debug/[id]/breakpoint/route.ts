import { NextRequest, NextResponse } from 'next/server'
import { getDebugAdapter } from '@/server/debug-adapter'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import path from 'node:path'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const adapter = getDebugAdapter()
    const session = adapter.getSession(id)
    
    if (!session) {
      return NextResponse.json(
        { error: 'Debug session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ breakpoints: session.breakpoints })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get breakpoints' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json() as { file: string; line: number; condition?: string }
    
    if (!body.file || body.line === undefined) {
      return NextResponse.json(
        { error: 'file and line are required' },
        { status: 400 }
      )
    }

    const adapter = getDebugAdapter()
    const session = adapter.getSession(id)
    if (!session) {
      return NextResponse.json(
        { error: 'Debug session not found' },
        { status: 404 }
      )
    }

    const basePath = session.config.cwd ?? process.env.PROJECT_PATH ?? process.cwd()
    const candidateFilePath = path.isAbsolute(body.file)
      ? path.resolve(body.file)
      : path.resolve(basePath, body.file)
    const resolvedFile = resolvePathWithinWorkspace(candidateFilePath)
    if (!resolvedFile.ok || !resolvedFile.path) {
      return NextResponse.json(
        { error: resolvedFile.error ?? 'Path outside workspace root' },
        { status: 403 }
      )
    }

    const breakpoint = await adapter.setBreakpoint(id, resolvedFile.path, body.line, body.condition)
    
    return NextResponse.json({ breakpoint })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set breakpoint' },
      { status: 500 }
    )
  }
}
