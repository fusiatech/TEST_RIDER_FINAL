import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject } from '@/server/storage'
import { TicketSchema } from '@/lib/types'

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
    return NextResponse.json(project.tickets)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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

    const body: unknown = await request.json()
    const result = TicketSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid ticket: ${result.error.message}` },
        { status: 400 }
      )
    }

    const ticket = { ...result.data, projectId: id }
    const updatedProject = {
      ...project,
      tickets: [...project.tickets, ticket],
      updatedAt: Date.now(),
    }
    await saveProject(updatedProject)
    return NextResponse.json(ticket, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
