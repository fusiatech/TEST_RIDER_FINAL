import { NextResponse } from 'next/server'
import { terminateTerminalSession } from '@/server/terminal-manager'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = terminateTerminalSession(id)

  if (!result.ok) {
    const status = result.error === 'Session not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true })
}
