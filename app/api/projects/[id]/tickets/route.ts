import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject } from '@/server/storage'
import { TicketSchema, type Ticket } from '@/lib/types'
import { z } from 'zod'
import { validateDependencyAddition, updateBlockedStatus } from '@/lib/dependency-utils'
import { sanitizeHTML, escapeHTML } from '@/lib/sanitize'

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

    const sanitizedData = {
      ...result.data,
      title: escapeHTML(result.data.title),
      description: sanitizeHTML(result.data.description),
      acceptanceCriteria: result.data.acceptanceCriteria.map(c => escapeHTML(c)),
    }
    const ticket = { ...sanitizedData, projectId: id }
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

const UpdateTicketSchema = z.object({
  ticketId: z.string(),
  dependencies: z.array(z.string()).optional(),
  blockedBy: z.array(z.string()).optional(),
  blocks: z.array(z.string()).optional(),
  status: z.string().optional(),
  epicId: z.string().optional().nullable(),
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
    const result = UpdateTicketSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { ticketId, dependencies, blockedBy, blocks, ...otherUpdates } = result.data
    const ticketIndex = project.tickets.findIndex((t) => t.id === ticketId)
    if (ticketIndex === -1) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const existingTicket = project.tickets[ticketIndex]

    if (dependencies) {
      for (const depId of dependencies) {
        if (!existingTicket.dependencies.includes(depId)) {
          const validation = validateDependencyAddition(project.tickets, ticketId, depId)
          if (!validation.valid) {
            return NextResponse.json({ error: validation.error }, { status: 400 })
          }
        }
      }
    }

    if (blockedBy) {
      for (const blockerId of blockedBy) {
        if (!(existingTicket.blockedBy || []).includes(blockerId)) {
          const validation = validateDependencyAddition(project.tickets, ticketId, blockerId)
          if (!validation.valid) {
            return NextResponse.json({ error: validation.error }, { status: 400 })
          }
        }
      }
    }

    if (blocks) {
      for (const blockedId of blocks) {
        const validation = validateDependencyAddition(project.tickets, blockedId, ticketId)
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 })
        }
      }
    }

    const now = Date.now()
    const updatedTicket: Ticket = {
      ...existingTicket,
      ...(dependencies !== undefined && { dependencies }),
      ...(blockedBy !== undefined && { blockedBy }),
      ...(blocks !== undefined && { blocks }),
      ...(otherUpdates.status !== undefined && { status: otherUpdates.status as Ticket['status'] }),
      ...(otherUpdates.epicId !== undefined && { epicId: otherUpdates.epicId ?? undefined }),
      updatedAt: now,
    }

    let updatedTickets = [...project.tickets]
    updatedTickets[ticketIndex] = updatedTicket

    updatedTickets = updateBlockedStatus(updatedTickets)

    const updatedProject = {
      ...project,
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    return NextResponse.json(updatedTicket)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const AddDependencySchema = z.object({
  ticketId: z.string(),
  dependencyId: z.string(),
  type: z.enum(['dependency', 'blockedBy', 'blocks']),
})

export async function PATCH(
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
    const result = AddDependencySchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { ticketId, dependencyId, type } = result.data

    const ticketIndex = project.tickets.findIndex((t) => t.id === ticketId)
    if (ticketIndex === -1) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const depTicket = project.tickets.find((t) => t.id === dependencyId)
    if (!depTicket) {
      return NextResponse.json({ error: 'Dependency ticket not found' }, { status: 404 })
    }

    const existingTicket = project.tickets[ticketIndex]
    const now = Date.now()

    let updatedTicket: Ticket
    let updatedTickets = [...project.tickets]

    if (type === 'dependency') {
      const validation = validateDependencyAddition(project.tickets, ticketId, dependencyId)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
      if (existingTicket.dependencies.includes(dependencyId)) {
        return NextResponse.json({ error: 'Dependency already exists' }, { status: 400 })
      }
      updatedTicket = {
        ...existingTicket,
        dependencies: [...existingTicket.dependencies, dependencyId],
        updatedAt: now,
      }
    } else if (type === 'blockedBy') {
      const validation = validateDependencyAddition(project.tickets, ticketId, dependencyId)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
      const blockedBy = existingTicket.blockedBy || []
      if (blockedBy.includes(dependencyId)) {
        return NextResponse.json({ error: 'Blocker already exists' }, { status: 400 })
      }
      updatedTicket = {
        ...existingTicket,
        blockedBy: [...blockedBy, dependencyId],
        updatedAt: now,
      }
      const depTicketIndex = updatedTickets.findIndex((t) => t.id === dependencyId)
      if (depTicketIndex !== -1) {
        const depTicketBlocks = updatedTickets[depTicketIndex].blocks || []
        if (!depTicketBlocks.includes(ticketId)) {
          updatedTickets[depTicketIndex] = {
            ...updatedTickets[depTicketIndex],
            blocks: [...depTicketBlocks, ticketId],
            updatedAt: now,
          }
        }
      }
    } else {
      const validation = validateDependencyAddition(project.tickets, dependencyId, ticketId)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
      const blocks = existingTicket.blocks || []
      if (blocks.includes(dependencyId)) {
        return NextResponse.json({ error: 'Already blocking this ticket' }, { status: 400 })
      }
      updatedTicket = {
        ...existingTicket,
        blocks: [...blocks, dependencyId],
        updatedAt: now,
      }
      const depTicketIndex = updatedTickets.findIndex((t) => t.id === dependencyId)
      if (depTicketIndex !== -1) {
        const depTicketBlockedBy = updatedTickets[depTicketIndex].blockedBy || []
        if (!depTicketBlockedBy.includes(ticketId)) {
          updatedTickets[depTicketIndex] = {
            ...updatedTickets[depTicketIndex],
            blockedBy: [...depTicketBlockedBy, ticketId],
            updatedAt: now,
          }
        }
      }
    }

    updatedTickets[ticketIndex] = updatedTicket
    updatedTickets = updateBlockedStatus(updatedTickets)

    const updatedProject = {
      ...project,
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    return NextResponse.json(updatedTicket)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const RemoveDependencySchema = z.object({
  ticketId: z.string(),
  dependencyId: z.string(),
  type: z.enum(['dependency', 'blockedBy', 'blocks']),
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
    const result = RemoveDependencySchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { ticketId, dependencyId, type } = result.data

    const ticketIndex = project.tickets.findIndex((t) => t.id === ticketId)
    if (ticketIndex === -1) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const existingTicket = project.tickets[ticketIndex]
    const now = Date.now()

    let updatedTicket: Ticket
    let updatedTickets = [...project.tickets]

    if (type === 'dependency') {
      updatedTicket = {
        ...existingTicket,
        dependencies: existingTicket.dependencies.filter((d) => d !== dependencyId),
        updatedAt: now,
      }
    } else if (type === 'blockedBy') {
      const blockedBy = existingTicket.blockedBy || []
      updatedTicket = {
        ...existingTicket,
        blockedBy: blockedBy.filter((d) => d !== dependencyId),
        updatedAt: now,
      }
      const depTicketIndex = updatedTickets.findIndex((t) => t.id === dependencyId)
      if (depTicketIndex !== -1) {
        const depTicketBlocks = updatedTickets[depTicketIndex].blocks || []
        updatedTickets[depTicketIndex] = {
          ...updatedTickets[depTicketIndex],
          blocks: depTicketBlocks.filter((d) => d !== ticketId),
          updatedAt: now,
        }
      }
    } else {
      const blocks = existingTicket.blocks || []
      updatedTicket = {
        ...existingTicket,
        blocks: blocks.filter((d) => d !== dependencyId),
        updatedAt: now,
      }
      const depTicketIndex = updatedTickets.findIndex((t) => t.id === dependencyId)
      if (depTicketIndex !== -1) {
        const depTicketBlockedBy = updatedTickets[depTicketIndex].blockedBy || []
        updatedTickets[depTicketIndex] = {
          ...updatedTickets[depTicketIndex],
          blockedBy: depTicketBlockedBy.filter((d) => d !== ticketId),
          updatedAt: now,
        }
      }
    }

    updatedTickets[ticketIndex] = updatedTicket
    updatedTickets = updateBlockedStatus(updatedTickets)

    const updatedProject = {
      ...project,
      tickets: updatedTickets,
      updatedAt: now,
    }
    await saveProject(updatedProject)

    return NextResponse.json(updatedTicket)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
