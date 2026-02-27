import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile, unlink, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getProject, saveProject } from '@/server/storage'
import { 
  TicketAttachmentSchema, 
  ALLOWED_ATTACHMENT_TYPES, 
  MAX_ATTACHMENT_SIZE,
  MAX_ATTACHMENTS_PER_TICKET,
  type TicketAttachment 
} from '@/lib/types'

const UPLOAD_DIR = join(process.cwd(), 'uploads')

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string }> }
): Promise<NextResponse> {
  try {
    const { id, ticketId } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const ticket = project.tickets.find((t) => t.id === ticketId)
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    
    return NextResponse.json({
      attachments: ticket.attachments || [],
      count: (ticket.attachments || []).length,
      maxAllowed: MAX_ATTACHMENTS_PER_TICKET,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string }> }
): Promise<NextResponse> {
  try {
    const { id, ticketId } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const ticketIndex = project.tickets.findIndex((t) => t.id === ticketId)
    if (ticketIndex === -1) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    
    const ticket = project.tickets[ticketIndex]
    const currentAttachments = ticket.attachments || []
    
    if (currentAttachments.length >= MAX_ATTACHMENTS_PER_TICKET) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ATTACHMENTS_PER_TICKET} attachments allowed per ticket` },
        { status: 400 }
      )
    }
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type as typeof ALLOWED_ATTACHMENT_TYPES[number])) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed types: ${ALLOWED_ATTACHMENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size: ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      )
    }
    
    const attachmentId = crypto.randomUUID()
    const ext = file.name.split('.').pop() || 'bin'
    const filename = `${attachmentId}.${ext}`
    const ticketDir = join(UPLOAD_DIR, id, ticketId)
    const filepath = join(ticketDir, filename)
    
    await mkdir(ticketDir, { recursive: true })
    
    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))
    
    const attachment: TicketAttachment = {
      id: attachmentId,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      url: `/api/projects/${id}/tickets/${ticketId}/attachments/${attachmentId}`,
      uploadedAt: Date.now(),
    }
    
    const validatedAttachment = TicketAttachmentSchema.parse(attachment)
    
    const updatedTicket = {
      ...ticket,
      attachments: [...currentAttachments, validatedAttachment],
      updatedAt: Date.now(),
    }
    
    project.tickets[ticketIndex] = updatedTicket
    await saveProject(project)
    
    return NextResponse.json({ attachment: validatedAttachment }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Attachment Upload Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ticketId: string }> }
): Promise<NextResponse> {
  try {
    const { id, ticketId } = await params
    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get('attachmentId')
    
    if (!attachmentId) {
      return NextResponse.json({ error: 'Attachment ID required' }, { status: 400 })
    }
    
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
    
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Attachment Delete Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
