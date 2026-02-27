import { NextRequest, NextResponse } from 'next/server'
import { getPrompts, savePrompt, getPromptByName } from '@/server/storage'
import { PromptSchema, PromptCategorySchema } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { z } from 'zod'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    
    let prompts = await getPrompts()
    
    if (category) {
      const categoryResult = PromptCategorySchema.safeParse(category)
      if (categoryResult.success) {
        prompts = prompts.filter((p) => p.category === categoryResult.data)
      }
    }
    
    return NextResponse.json(prompts)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const CreatePromptSchema = z.object({
  name: z.string().min(1).max(100),
  category: PromptCategorySchema,
  description: z.string().optional(),
  content: z.string().min(1),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const permissionError = await requirePermission('canConfigureSettings')
  if (permissionError) return permissionError

  try {
    const body: unknown = await request.json()
    const result = CreatePromptSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid prompt: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const existing = await getPromptByName(result.data.name)
    if (existing) {
      return NextResponse.json(
        { error: `Prompt with name "${result.data.name}" already exists` },
        { status: 409 }
      )
    }
    
    const now = new Date().toISOString()
    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const versionId = `version-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    
    const prompt = {
      id: promptId,
      name: result.data.name,
      category: result.data.category,
      description: result.data.description,
      currentVersion: 1,
      versions: [
        {
          id: versionId,
          promptId,
          version: 1,
          content: result.data.content,
          description: 'Initial version',
          createdAt: now,
          createdBy: 'system',
          isActive: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    }
    
    const parseResult = PromptSchema.safeParse(prompt)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: `Invalid prompt data: ${parseResult.error.message}` },
        { status: 500 }
      )
    }
    
    await savePrompt(parseResult.data)
    return NextResponse.json(parseResult.data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
