import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getProject, saveProject } from '@/server/storage'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string; attachmentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, ticketId, attachmentId } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const ticket = project.tickets.find((t) => t.id === ticketId)
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    
    const attachment = (ticket.attachments || []).find((a) => a.id === attachmentId)
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }
    
    const filepath = join(UPLOAD_DIR, id, ticketId, attachment.filename)
    
    if (!existsSync(filepath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }
    
    const fileBuffer = await readFile(filepath)
    
    const headers = new Headers()
    headers.set('Content-Type', attachment.mimeType)
    headers.set('Content-Length', String(attachment.size))
    headers.set('Content-Disposition', `inline; filename="${attachment.originalName}"`)
    headers.set('Cache-Control', 'private, max-age=3600')
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Attachment Fetch Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string; attachmentId: string }> }
): Promise<NextResponse> {
  try {
    const { id, ticketId, attachmentId } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const ticketIndex = project.tickets.findIndex((t) => t.id === ticketId)
    if (ticketIndex === -1) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    
    const ticket = project.tickets[ticketIndex]
    const attachments = ticket.attachments || []
    const attachmentIndex = attachments.findIndex((a) => a.id === attachmentId)
    
    if (attachmentIndex === -1) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }
    
    const attachment = attachments[attachmentIndex]
    const filepath = join(UPLOAD_DIR, id, ticketId, attachment.filename)
    
    if (existsSync(filepath)) {
      await unlink(filepath)
    }
    
    const updatedAttachments = attachments.filter((a) => a.id !== attachmentId)
    const updatedTicket = {
      ...ticket,
      attachments: updatedAttachments,
      updatedAt: Date.now(),
    }
    
    project.tickets[ticketIndex] = updatedTicket
    await saveProject(project)
    
    return NextResponse.json({ success: true, deleted: attachment.originalName })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Attachment Delete Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
