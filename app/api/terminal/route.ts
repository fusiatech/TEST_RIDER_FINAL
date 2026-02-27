import { NextRequest, NextResponse } from 'next/server'
import { createTerminalSession, listTerminalSessions, initializeTerminalPersistence } from '@/server/terminal-manager'

export const runtime = 'nodejs'

export async function GET() {
  await initializeTerminalPersistence()
  return NextResponse.json({ sessions: listTerminalSessions() })
}

export async function POST(request: NextRequest) {
  await initializeTerminalPersistence()

  let cols = 120
  let rows = 32
  let name: string | undefined
  let cwd: string | undefined

  try {
    const body = await request.json()
    cols = Number(body?.cols ?? cols)
    rows = Number(body?.rows ?? rows)
    name = body?.name
    cwd = body?.cwd
  } catch {
    // keep defaults when no body provided
  }

  const session = createTerminalSession(cols, rows, name, cwd)
  return NextResponse.json({ session }, { status: 201 })
}
