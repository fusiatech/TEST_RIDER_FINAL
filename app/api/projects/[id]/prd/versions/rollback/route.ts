import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject } from '@/server/storage'
import * as prdVersioning from '@/server/prd-versioning'
import { z } from 'zod'

const RollbackSchema = z.object({
  version: z.number().min(1),
  author: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const body = await request.json()
    const result = RollbackSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { version, author } = result.data
    
    const newVersion = await prdVersioning.rollbackToVersion(
      id,
      version,
      author || 'user'
    )
    
    if (!newVersion) {
      return NextResponse.json(
        { error: `Version ${version} not found` },
        { status: 404 }
      )
    }
    
    const updatedProject = {
      ...project,
      prd: newVersion.content,
      prdStatus: 'draft' as const,
      updatedAt: Date.now(),
    }
    
    await saveProject(updatedProject)
    
    return NextResponse.json({
      success: true,
      version: newVersion.version,
      content: newVersion.content,
      sections: newVersion.sections,
      message: `Rolled back to version ${version}, created new version ${newVersion.version}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
