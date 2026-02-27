import { NextRequest, NextResponse } from 'next/server'
import { writeTerminalSession } from '@/server/terminal-manager'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const input = typeof body?.input === 'string' ? body.input : ''

  if (!input) {
    return NextResponse.json({ error: 'input is required' }, { status: 400 })
  }

  const result = writeTerminalSession(id, input)
  if (!result.ok) {
    const status = result.error === 'Session not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true })
}
