import { NextRequest, NextResponse } from 'next/server'
import { getPrompt, rollbackPromptVersion } from '@/server/storage'
import { requirePermission } from '@/lib/permissions'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const RollbackSchema = z.object({
  version: z.number().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const permissionError = await requirePermission('canConfigureSettings')
  if (permissionError) return permissionError

  try {
    const { id } = await params
    const prompt = await getPrompt(id)
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }
    
    const body: unknown = await request.json()
    const result = RollbackSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid rollback request: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const targetVersion = result.data.version
    const versionExists = prompt.versions.some((v) => v.version === targetVersion)
    
    if (!versionExists) {
      return NextResponse.json(
        { error: `Version ${targetVersion} not found` },
        { status: 404 }
      )
    }
    
    const updatedPrompt = await rollbackPromptVersion(id, targetVersion)
    
    if (!updatedPrompt) {
      return NextResponse.json(
        { error: 'Failed to rollback version' },
        { status: 500 }
      )
    }
    
    return NextResponse.json(updatedPrompt)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
