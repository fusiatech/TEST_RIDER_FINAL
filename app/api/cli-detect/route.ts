import { NextResponse } from 'next/server'
import { detectInstalledCLIs } from '@/server/cli-detect'

export async function GET(): Promise<NextResponse> {
  try {
    const clis = await detectInstalledCLIs()
    return NextResponse.json(clis)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
