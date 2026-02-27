import { NextRequest, NextResponse } from 'next/server'
import { getProject } from '@/server/storage'
import * as prdVersioning from '@/server/prd-versioning'
import { z } from 'zod'

const UnlinkEpicSchema = z.object({
  epicId: z.string().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
): Promise<NextResponse> {
  try {
    const { id, sectionId } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const body = await request.json()
    const result = UnlinkEpicSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { epicId } = result.data
    
    const success = await prdVersioning.unlinkSectionFromEpic(
      id,
      sectionId,
      epicId
    )
    
    if (!success) {
      return NextResponse.json(
        { error: 'Section not found or unlink failed' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: `Unlinked epic ${epicId} from section ${sectionId}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
