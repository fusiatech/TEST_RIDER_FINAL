import { NextRequest, NextResponse } from 'next/server'
import { getPrompt, savePrompt, deletePrompt, addPromptVersion } from '@/server/storage'
import { PromptCategorySchema } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { auth } from '@/auth'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params
    const prompt = await getPrompt(id)
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(prompt)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdatePromptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: PromptCategorySchema.optional(),
  description: z.string().optional(),
  content: z.string().min(1).optional(),
  versionDescription: z.string().optional(),
})

export async function PUT(
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
    const result = UpdatePromptSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const session = await auth()
    const now = new Date().toISOString()
    
    if (result.data.content) {
      const newVersion = prompt.currentVersion + 1
      const versionId = `version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      
      const updatedPrompt = await addPromptVersion(id, {
        id: versionId,
        promptId: id,
        version: newVersion,
        content: result.data.content,
        description: result.data.versionDescription ?? `Version ${newVersion}`,
        createdAt: now,
        createdBy: session?.user?.email ?? 'anonymous',
        isActive: true,
      })
      
      if (!updatedPrompt) {
        return NextResponse.json(
          { error: 'Failed to add version' },
          { status: 500 }
        )
      }
      
      if (result.data.name) updatedPrompt.name = result.data.name
      if (result.data.category) updatedPrompt.category = result.data.category
      if (result.data.description !== undefined) updatedPrompt.description = result.data.description
      
      await savePrompt(updatedPrompt)
      return NextResponse.json(updatedPrompt)
    }
    
    if (result.data.name) prompt.name = result.data.name
    if (result.data.category) prompt.category = result.data.category
    if (result.data.description !== undefined) prompt.description = result.data.description
    prompt.updatedAt = now
    
    await savePrompt(prompt)
    return NextResponse.json(prompt)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
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
    
    await deletePrompt(id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
