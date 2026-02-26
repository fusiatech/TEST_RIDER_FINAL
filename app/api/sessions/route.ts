import { NextRequest, NextResponse } from 'next/server'
import { getSessions, saveSession } from '@/server/storage'
import { SessionSchema } from '@/lib/types'

export async function GET(): Promise<NextResponse> {
  try {
    const sessions = await getSessions()
    return NextResponse.json(sessions)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = SessionSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid session: ${result.error.message}` },
        { status: 400 }
      )
    }
    await saveSession(result.data)
    return NextResponse.json(result.data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
