import { NextRequest, NextResponse } from 'next/server'
import { getProjects, saveProject } from '@/server/storage'
import { ProjectSchema } from '@/lib/types'

export async function GET(): Promise<NextResponse> {
  try {
    const projects = await getProjects()
    return NextResponse.json(projects)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = ProjectSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid project: ${result.error.message}` },
        { status: 400 }
      )
    }
    await saveProject(result.data)
    return NextResponse.json(result.data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
