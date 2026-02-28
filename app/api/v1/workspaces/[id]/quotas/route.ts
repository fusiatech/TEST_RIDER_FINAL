import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getWorkspace, updateWorkspace } from '@/server/storage'
import { WorkspaceQuotaPolicySchema } from '@/lib/types'
import { getDefaultWorkspaceQuotaPolicy, resolveWorkspaceQuotaPolicy, getWorkspaceUsage } from '@/server/workspace-quotas'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

const WorkspaceQuotaUpdateSchema = z.object({
  maxFileCount: z.number().min(1).max(1_000_000).optional(),
  maxTotalBytes: z.number().min(1024).max(1000 * 1024 * 1024 * 1024).optional(),
  maxFileSizeBytes: z.number().min(1).max(1024 * 1024 * 1024).optional(),
  maxTerminalSessions: z.number().min(1).max(50).optional(),
  maxConcurrentRuns: z.number().min(1).max(50).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const workspace = await getWorkspace(id)
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    const quota = resolveWorkspaceQuotaPolicy(workspace.settings?.quota)
    const usage = getWorkspaceUsage(workspace.path)

    const response = NextResponse.json({
      workspaceId: id,
      quota,
      usage,
      defaults: getDefaultWorkspaceQuotaPolicy(),
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const workspace = await getWorkspace(id)
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }
    const body: unknown = await request.json()
    const parsed = WorkspaceQuotaUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid quota update', details: parsed.error.errors },
        { status: 400 }
      )
    }
    const quota = WorkspaceQuotaPolicySchema.parse({
      ...getDefaultWorkspaceQuotaPolicy(),
      ...(workspace.settings?.quota ?? {}),
      ...parsed.data,
    })
    const updated = await updateWorkspace(id, {
      settings: {
        ...(workspace.settings ?? {}),
        quota,
      },
    })
    if (!updated) {
      return NextResponse.json({ error: 'Failed to update workspace quota' }, { status: 500 })
    }

    const response = NextResponse.json({
      workspaceId: id,
      quota,
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

