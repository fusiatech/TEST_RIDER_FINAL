import { NextRequest, NextResponse } from 'next/server'
import { getProject } from '@/server/storage'
import * as prdVersioning from '@/server/prd-versioning'
import { z } from 'zod'

const LinkTicketSchema = z.object({
  ticketId: z.string().min(1),
  linkedBy: z.string().optional(),
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
    const result = LinkTicketSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { ticketId, linkedBy } = result.data
    
    const ticket = project.tickets.find(t => t.id === ticketId)
    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found in project' },
        { status: 404 }
      )
    }
    
    const success = await prdVersioning.linkSectionToTicket(
      id,
      sectionId,
      ticketId,
      linkedBy
    )
    
    if (!success) {
      return NextResponse.json(
        { error: 'Section not found or link failed' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: `Linked ticket ${ticketId} to section ${sectionId}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
