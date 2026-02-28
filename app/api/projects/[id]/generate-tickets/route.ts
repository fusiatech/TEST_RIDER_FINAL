import { NextRequest, NextResponse } from 'next/server'
import { generateTicketPrompt, parseGeneratedTickets, buildTicketHierarchy, estimateTotalEffort, type GeneratedTicket } from '@/lib/prd-parser'
import { getProject, saveProject, getEffectiveSettingsForUser } from '@/server/storage'
import { runAPIAgent } from '@/server/api-runner'
import type { Ticket, TicketLevel } from '@/lib/types'
import { z } from 'zod'
import { auth } from '@/auth'

const GenerateTicketsOptionsSchema = z.object({
  preview: z.boolean().optional(),
  includeSubtasks: z.boolean().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    if (!project.prd) {
      return NextResponse.json(
        { error: 'No PRD found. Please generate or add a PRD first.' },
        { status: 400 }
      )
    }
    
    const body = await request.json().catch(() => ({}))
    const options = GenerateTicketsOptionsSchema.parse(body)
    
    const settings = await getEffectiveSettingsForUser(session.user.id)
    const apiKey = settings.apiKeys?.openai
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add it in Settings.' },
        { status: 400 }
      )
    }
    
    const prompt = generateTicketPrompt(project.prd)
    let response = ''
    
    await runAPIAgent({
      provider: 'chatgpt',
      prompt,
      apiKey,
      onOutput: (chunk) => {
        response += chunk
      },
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    
    if (!response) {
      return NextResponse.json(
        { error: 'Failed to generate tickets - no response received' },
        { status: 500 }
      )
    }
    
    const generatedTickets = parseGeneratedTickets(response)
    const hierarchy = buildTicketHierarchy(generatedTickets)
    const effort = estimateTotalEffort(generatedTickets)
    
    if (options.preview) {
      return NextResponse.json({
        preview: true,
        tickets: generatedTickets,
        hierarchy: {
          epics: hierarchy.epics.length,
          stories: hierarchy.stories.length,
          tasks: hierarchy.tasks.length,
          orphans: hierarchy.orphans.length,
        },
        effort,
      })
    }
    
    const now = Date.now()
    const ticketMap = new Map<string, string>()
    const createdTickets: Ticket[] = []
    
    for (const epic of hierarchy.epics) {
      const ticket = createTicketFromGenerated(epic, id, now, ticketMap)
      ticketMap.set(epic.title.toLowerCase(), ticket.id)
      createdTickets.push(ticket)
    }
    
    for (const story of hierarchy.stories) {
      const ticket = createTicketFromGenerated(story, id, now, ticketMap)
      ticketMap.set(story.title.toLowerCase(), ticket.id)
      
      if (story.parentTitle) {
        const parentId = ticketMap.get(story.parentTitle.toLowerCase())
        if (parentId) {
          ticket.epicId = parentId
          ticket.parentId = parentId
        }
      }
      
      createdTickets.push(ticket)
    }
    
    for (const task of hierarchy.tasks) {
      const ticket = createTicketFromGenerated(task, id, now, ticketMap)
      ticketMap.set(task.title.toLowerCase(), ticket.id)
      
      if (task.parentTitle) {
        const parentId = ticketMap.get(task.parentTitle.toLowerCase())
        if (parentId) {
          ticket.storyId = parentId
          ticket.parentId = parentId
          
          const parentTicket = createdTickets.find((t) => t.id === parentId)
          if (parentTicket?.epicId) {
            ticket.epicId = parentTicket.epicId
          }
        }
      }
      
      createdTickets.push(ticket)
    }
    
    for (const orphan of hierarchy.orphans) {
      const ticket = createTicketFromGenerated(orphan, id, now, ticketMap)
      createdTickets.push(ticket)
    }
    
    for (const ticket of createdTickets) {
      const generated = generatedTickets.find(
        (g) => g.title.toLowerCase() === ticket.title.toLowerCase()
      )
      if (generated?.dependencies) {
        ticket.dependencies = generated.dependencies
          .map((depTitle) => ticketMap.get(depTitle.toLowerCase()))
          .filter((id): id is string => !!id)
      }
    }
    
    const updatedProject = {
      ...project,
      tickets: [...project.tickets, ...createdTickets],
      updatedAt: now,
    }
    
    await saveProject(updatedProject)
    
    return NextResponse.json({
      success: true,
      created: createdTickets.length,
      tickets: createdTickets,
      hierarchy: {
        epics: hierarchy.epics.length,
        stories: hierarchy.stories.length,
        tasks: hierarchy.tasks.length,
        orphans: hierarchy.orphans.length,
      },
      effort,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Ticket Generation Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function createTicketFromGenerated(
  generated: GeneratedTicket,
  projectId: string,
  timestamp: number,
  _ticketMap: Map<string, string>
): Ticket {
  const levelMap: Record<string, TicketLevel> = {
    epic: 'epic',
    story: 'story',
    task: 'task',
    subtask: 'subtask',
    feature: 'feature',
    subatomic: 'subatomic',
  }
  
  return {
    id: crypto.randomUUID(),
    projectId,
    title: generated.title,
    description: generated.description,
    acceptanceCriteria: generated.acceptanceCriteria,
    complexity: generated.complexity,
    status: 'backlog',
    assignedRole: generated.assignedRole,
    level: levelMap[generated.level] || 'task',
    dependencies: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
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
    
    const tickets = project.tickets
    const epics = tickets.filter((t) => t.level === 'epic')
    const stories = tickets.filter((t) => t.level === 'story')
    const tasks = tickets.filter((t) => t.level === 'task' || t.level === 'subtask')
    
    return NextResponse.json({
      total: tickets.length,
      hierarchy: {
        epics: epics.length,
        stories: stories.length,
        tasks: tasks.length,
      },
      byStatus: {
        backlog: tickets.filter((t) => t.status === 'backlog').length,
        in_progress: tickets.filter((t) => t.status === 'in_progress').length,
        review: tickets.filter((t) => t.status === 'review').length,
        done: tickets.filter((t) => t.status === 'done').length,
        rejected: tickets.filter((t) => t.status === 'rejected').length,
      },
      byComplexity: {
        S: tickets.filter((t) => t.complexity === 'S').length,
        M: tickets.filter((t) => t.complexity === 'M').length,
        L: tickets.filter((t) => t.complexity === 'L').length,
        XL: tickets.filter((t) => t.complexity === 'XL').length,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
