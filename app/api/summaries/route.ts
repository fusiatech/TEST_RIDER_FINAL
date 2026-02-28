import { NextRequest, NextResponse } from 'next/server'
import {
  generateTicketSummaryPrompt,
  generateProjectSummaryPrompt,
} from '@/lib/summary-generator'
import { getEffectiveSettingsForUser, getProject, getProjects } from '@/server/storage'
import { auth } from '@/auth'

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that summarizes technical content for non-technical users. Keep responses concise and jargon-free.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${error}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return data.choices?.[0]?.message?.content || ''
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error (${response.status}): ${error}`)
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
  }
  return data.content?.[0]?.text || ''
}

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
    const openaiKey = settings.apiKeys?.openai
    const anthropicKey = settings.apiKeys?.anthropic

    if (!openaiKey && !anthropicKey) {
      return NextResponse.json(
        {
          error:
            'No AI API key configured. Add an OpenAI or Anthropic key in Settings.',
        },
        { status: 400 }
      )
    }

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

    let summary: string
    if (openaiKey) {
      summary = await callOpenAI(prompt, openaiKey)
    } else if (anthropicKey) {
      summary = await callAnthropic(prompt, anthropicKey)
    } else {
      return NextResponse.json(
        { error: 'No API key available' },
        { status: 400 }
      )
    }

    return NextResponse.json({ summary })
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
