import { NextRequest, NextResponse } from 'next/server'
import {
  generateTicketSummaryPrompt,
  generateProjectSummaryPrompt,
} from '@/lib/summary-generator'
import { getEffectiveSettingsForUser, getProject, getProjects } from '@/server/storage'
import { runGenerationGateway } from '@/server/generation-gateway'
import { auth } from '@/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, id } = body as { type?: string; id?: string }

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Type and ID are required' },
        { status: 400 }
      )
    }

    const settings = await getEffectiveSettingsForUser(session.user.id)

    let prompt: string

    if (type === 'ticket') {
      const projects = await getProjects()
      let ticket = null
      for (const project of projects) {
        const found = project.tickets.find((t) => t.id === id)
        if (found) {
          ticket = found
          break
        }
      }

      if (!ticket) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
      }

      prompt = generateTicketSummaryPrompt(ticket)
    } else if (type === 'project') {
      const project = await getProject(id)
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }

      prompt = generateProjectSummaryPrompt(project)
    } else {
      return NextResponse.json(
        { error: 'Invalid type. Must be "ticket" or "project".' },
        { status: 400 }
      )
    }

    const generation = await runGenerationGateway({
      prompt,
      settings,
      artifactType: `summary_${type}`,
      deterministicFallback: () =>
        `Deterministic summary (${type}): ${prompt.replace(/\s+/g, ' ').slice(0, 260)}...`,
    })

    return NextResponse.json({ summary: generation.text, generation: generation.metadata })
  } catch (error) {
    console.error('[summaries] Error generating summary:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate summary',
      },
      { status: 500 }
    )
  }
}
