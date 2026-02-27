import { NextRequest, NextResponse } from 'next/server'
import { resizeTerminalSession } from '@/server/terminal-manager'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const cols = Number(body?.cols)
  const rows = Number(body?.rows)

  if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
    return NextResponse.json({ error: 'cols and rows are required numbers' }, { status: 400 })
  }

  const result = resizeTerminalSession(id, cols, rows)
  if (!result.ok) {
    const status = result.error === 'Session not found' ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({ ok: true })
}
