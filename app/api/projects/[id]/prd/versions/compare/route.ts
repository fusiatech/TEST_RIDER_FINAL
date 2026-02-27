import { NextRequest, NextResponse } from 'next/server'
import { getProject } from '@/server/storage'
import * as prdVersioning from '@/server/prd-versioning'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    const v1 = searchParams.get('v1')
    const v2 = searchParams.get('v2')
    
    if (!v1 || !v2) {
      return NextResponse.json(
        { error: 'Both v1 and v2 query parameters are required' },
        { status: 400 }
      )
    }
    
    const version1 = parseInt(v1, 10)
    const version2 = parseInt(v2, 10)
    
    if (isNaN(version1) || isNaN(version2)) {
      return NextResponse.json(
        { error: 'v1 and v2 must be valid version numbers' },
        { status: 400 }
      )
    }
    
    const diff = await prdVersioning.compareVersions(id, version1, version2)
    
    if (!diff) {
      return NextResponse.json(
        { error: 'One or both versions not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      diff,
      v1: version1,
      v2: version2,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
