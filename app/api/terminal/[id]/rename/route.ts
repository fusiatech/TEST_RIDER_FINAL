import { NextRequest, NextResponse } from 'next/server'
import { renameTerminalSession } from '@/server/terminal-manager'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let name: string
  try {
    const body = await request.json()
    name = body?.name
    if (typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const result = renameTerminalSession(id, name)

  if (!result.ok) {
    const status = result.error === 'Session not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true })
}
