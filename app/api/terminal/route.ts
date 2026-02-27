import { NextRequest, NextResponse } from 'next/server'
import { createTerminalSession, listTerminalSessions } from '@/server/terminal-manager'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ sessions: listTerminalSessions() })
}

export async function POST(request: NextRequest) {
  let cols = 120
  let rows = 32

  try {
    const body = await request.json()
    cols = Number(body?.cols ?? cols)
    rows = Number(body?.rows ?? rows)
  } catch {
    // keep defaults when no body provided
  }

  const session = createTerminalSession(cols, rows)
  return NextResponse.json({ session }, { status: 201 })
}
