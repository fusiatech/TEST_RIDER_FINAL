import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject } from '@/server/storage'
import { EpicSchema, type Epic, type Ticket } from '@/lib/types'
import { z } from 'zod'

function computeEpicProgress(epic: Epic, tickets: Ticket[]): number {
  const epicTickets = tickets.filter((t) => epic.ticketIds.includes(t.id))
  if (epicTickets.length === 0) return 0
  const doneCount = epicTickets.filter(
    (t) => t.status === 'done' || t.status === 'approved'
  ).length
  return Math.round((doneCount / epicTickets.length) * 100)
}

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

    const epicsWithProgress = project.epics.map((epic) => ({
      ...epic,
      progress: computeEpicProgress(epic, project.tickets),
    }))

    return NextResponse.json(epicsWithProgress)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const CreateEpicSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  ticketIds: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'completed']).optional(),
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

    const body: unknown = await request.json()
    const result = CreateEpicSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid epic: ${result.error.message}` },
        { status: 400 }
      )
    }

    const now = Date.now()
    const epic: Epic = {
      id: `epic-${now}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: id,
      title: result.data.title,
      description: result.data.description,
      ticketIds: result.data.ticketIds || [],
      status: result.data.status || 'draft',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    }

    const updatedTickets = project.tickets.map((t) =>
      epic.ticketIds.includes(t.id)
        ? { ...t, epicId: epic.id, updatedAt: now }
        : t
    )

    const updatedProject = {
      ...project,
      epics: [...project.epics, epic],
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    return NextResponse.json(epic, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdateEpicSchema = z.object({
  epicId: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  ticketIds: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'completed']).optional(),
})

export async function PUT(
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
    const result = UpdateEpicSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { epicId, ...updates } = result.data
    const epicIndex = project.epics.findIndex((e) => e.id === epicId)
    if (epicIndex === -1) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 })
    }

    const now = Date.now()
    const existingEpic = project.epics[epicIndex]
    const oldTicketIds = existingEpic.ticketIds
    const newTicketIds = updates.ticketIds ?? oldTicketIds

    const updatedEpic: Epic = {
      ...existingEpic,
      ...updates,
      ticketIds: newTicketIds,
      updatedAt: now,
    }

    updatedEpic.progress = computeEpicProgress(updatedEpic, project.tickets)

    const updatedTickets = project.tickets.map((t) => {
      const wasInEpic = oldTicketIds.includes(t.id)
      const isInEpic = newTicketIds.includes(t.id)

      if (!wasInEpic && isInEpic) {
        return { ...t, epicId: epicId, updatedAt: now }
      }
      if (wasInEpic && !isInEpic && t.epicId === epicId) {
        return { ...t, epicId: undefined, updatedAt: now }
      }
      return t
    })

    const updatedEpics = [...project.epics]
    updatedEpics[epicIndex] = updatedEpic

    const updatedProject = {
      ...project,
      epics: updatedEpics,
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    return NextResponse.json(updatedEpic)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const DeleteEpicSchema = z.object({
  epicId: z.string(),
})

export async function DELETE(
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
    const result = DeleteEpicSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { epicId } = result.data
    const epic = project.epics.find((e) => e.id === epicId)
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 })
    }

    const now = Date.now()
    const updatedTickets = project.tickets.map((t) =>
      t.epicId === epicId ? { ...t, epicId: undefined, updatedAt: now } : t
    )

    const updatedProject = {
      ...project,
      epics: project.epics.filter((e) => e.id !== epicId),
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    return new NextResponse(null, { status: 204 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
