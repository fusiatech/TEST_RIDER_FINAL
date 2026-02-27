import { NextRequest, NextResponse } from 'next/server'
import { getWorkspaces, saveWorkspace } from '@/server/storage'
import type { Workspace } from '@/lib/types'
import { WorkspaceSchema } from '@/lib/types'
import { existsSync } from 'fs'
import path from 'path'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

export async function GET() {
  try {
    const workspaces = await getWorkspaces()
    return NextResponse.json({ workspaces })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch workspaces'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const parsed = WorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid workspace data', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const workspace: Workspace = parsed.data

    const resolved = resolvePathWithinWorkspace(workspace.path)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 }
      )
    }

    const normalizedPath = path.normalize(resolved.path)
    if (!existsSync(normalizedPath)) {
      return NextResponse.json(
        { error: `Path does not exist: ${workspace.path}` },
        { status: 400 }
      )
    }

    const workspaceToSave: Workspace = {
      ...workspace,
      path: normalizedPath,
    }

    await saveWorkspace(workspaceToSave)
    return NextResponse.json({ workspace: workspaceToSave })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create workspace'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
