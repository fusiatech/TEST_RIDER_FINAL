import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    message: 'LSP WebSocket endpoint. Connect via WebSocket at /api/lsp/ws',
    supportedLanguages: ['typescript', 'javascript'],
    endpoints: {
      typescript: '/api/lsp/ws?language=typescript',
      javascript: '/api/lsp/ws?language=javascript',
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, language } = body

    if (action === 'status') {
      return NextResponse.json({
        available: true,
        language: language || 'typescript',
        serverType: 'tsserver',
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
