import { NextRequest, NextResponse } from 'next/server'
import { getProject } from '@/server/storage'
import * as prdVersioning from '@/server/prd-versioning'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const versions = await prdVersioning.getVersions(id)
    
    return NextResponse.json({
      versions,
      total: versions.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
