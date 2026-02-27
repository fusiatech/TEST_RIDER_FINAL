import { NextResponse } from 'next/server'
import { detectCLIProviderDiagnostics } from '@/server/cli-detect'

export async function GET(): Promise<NextResponse> {
  try {
    const diagnostics = detectCLIProviderDiagnostics()
    return NextResponse.json(diagnostics)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
