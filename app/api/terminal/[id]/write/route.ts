import { NextRequest, NextResponse } from 'next/server'
import { writeTerminalSession } from '@/server/terminal-manager'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { sanitizeCommand, containsDangerousCommand } from '@/lib/sanitize'

export const runtime = 'nodejs'

const TERMINAL_WRITE_RATE_LIMIT = { interval: 60_000, limit: 60 }

const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+[/\\]/i,
  /\bsudo\s+rm\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=.*of=\/dev\//i,
  /\b:(){ :|:& };:/,
  /\bfork\s*bomb/i,
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const identifier = getClientIdentifier(request)
  const { success, headers, result } = await checkRateLimit(
    new Request(request.url, {
      headers: new Headers([['x-forwarded-for', identifier]]),
    }),
    TERMINAL_WRITE_RATE_LIMIT
  )

  if (!success) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.reset - Date.now()) / 1000)} seconds.`,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...Object.fromEntries(headers.entries()),
        },
      }
    )
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const input = typeof body?.input === 'string' ? body.input : ''

  if (!input) {
    return NextResponse.json({ error: 'input is required' }, { status: 400 })
  }

  if (containsDangerousCommand(input) || BLOCKED_COMMANDS.some(p => p.test(input))) {
    return NextResponse.json(
      { error: 'Command blocked for security reasons' },
      { status: 403 }
    )
  }

  const writeResult = writeTerminalSession(id, input)
  if (!writeResult.ok) {
    const status = writeResult.error === 'Session not found' ? 404 : 400
    return NextResponse.json({ error: writeResult.error }, { status })
  }

  const response = NextResponse.json({ ok: true })
  headers.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}
