import { NextRequest, NextResponse } from 'next/server'
import { createTerminalSession, listTerminalSessions, initializeTerminalPersistence } from '@/server/terminal-manager'
import { getDefaultWorkspaceQuotaPolicy } from '@/server/workspace-quotas'

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

  const quota = getDefaultWorkspaceQuotaPolicy()
  const activeSessions = listTerminalSessions().filter((s) => !s.terminated).length
  if (activeSessions >= quota.maxTerminalSessions) {
    return NextResponse.json(
      {
        error: `Terminal session quota exceeded (${activeSessions} >= ${quota.maxTerminalSessions})`,
      },
      { status: 413 }
    )
  }

  const session = createTerminalSession(cols, rows, name, cwd)
  return NextResponse.json({ session }, { status: 201 })
}
