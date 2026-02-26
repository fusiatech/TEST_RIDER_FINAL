import { NextRequest, NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/server/storage'
import { SettingsSchema } from '@/lib/types'

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await getSettings()
    return NextResponse.json(settings)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = SettingsSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid settings: ${result.error.message}` },
        { status: 400 }
      )
    }
    await saveSettings(result.data)
    return NextResponse.json(result.data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
