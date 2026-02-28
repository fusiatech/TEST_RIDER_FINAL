import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { DEFAULT_UI_PREFERENCES, UserUIPreferencesSchema } from '@/lib/types'
import { getUserUIPreferences, saveUserUIPreferences } from '@/server/storage'

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const preferences = await getUserUIPreferences(userId)
    return NextResponse.json(preferences ?? DEFAULT_UI_PREFERENCES)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = (await getUserUIPreferences(userId)) ?? DEFAULT_UI_PREFERENCES
    const body: unknown = await request.json()
    const parsedPatch = UserUIPreferencesSchema.partial().safeParse(body)

    if (!parsedPatch.success) {
      return NextResponse.json(
        { error: `Invalid preferences payload: ${parsedPatch.error.message}` },
        { status: 400 }
      )
    }

    const merged = UserUIPreferencesSchema.parse({
      ...existing,
      ...parsedPatch.data,
      preview: {
        ...existing.preview,
        ...(parsedPatch.data.preview ?? {}),
      },
      observability: {
        ...existing.observability,
        ...(parsedPatch.data.observability ?? {}),
      },
      composer: {
        ...existing.composer,
        ...(parsedPatch.data.composer ?? {}),
        reasoningByModel: {
          ...existing.composer.reasoningByModel,
          ...(parsedPatch.data.composer?.reasoningByModel ?? {}),
        },
      },
    })

    await saveUserUIPreferences(userId, merged)
    return NextResponse.json(merged)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
