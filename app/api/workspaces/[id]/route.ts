import { NextRequest, NextResponse } from 'next/server'
import { getWorkspace, updateWorkspace, deleteWorkspace } from '@/server/storage'
import { WorkspaceSettingsSchema } from '@/lib/types'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { existsSync } from 'fs'
import path from 'path'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  lastOpenedAt: z.string().optional(),
  settings: WorkspaceSettingsSchema.optional(),
})

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const workspace = await getWorkspace(id)
    
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    return NextResponse.json({ workspace })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch workspace'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body: unknown = await request.json()
    const parsed = UpdateWorkspaceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid workspace update', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const existing = await getWorkspace(id)
    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    const updatePayload = { ...parsed.data }
    if (updatePayload.path) {
      const resolved = resolvePathWithinWorkspace(updatePayload.path)
      if (!resolved.ok || !resolved.path) {
        return NextResponse.json(
          { error: resolved.error ?? 'Path outside workspace root' },
          { status: 403 }
        )
      }

      const normalizedPath = path.normalize(resolved.path)
      if (!existsSync(normalizedPath)) {
        return NextResponse.json(
          { error: `Path does not exist: ${updatePayload.path}` },
          { status: 400 }
        )
      }
      updatePayload.path = normalizedPath
    }

    const updated = await updateWorkspace(id, updatePayload)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 })
    }

    return NextResponse.json({ workspace: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update workspace'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    const existing = await getWorkspace(id)
    if (!existing) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    await deleteWorkspace(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete workspace'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
