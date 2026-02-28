import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getEffectiveSettingsForUser } from '@/server/storage'
import {
  resolveGenerationRoute,
  type GenerationProvider,
} from '@/server/generation-gateway'

const ResolveSchema = z.object({
  preferredProvider: z.enum(['chatgpt', 'gemini-api', 'claude']).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = ResolveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid payload: ${parsed.error.message}` },
      { status: 400 },
    )
  }

  const settings = await getEffectiveSettingsForUser(session.user.id)
  const preferredProvider = parsed.data.preferredProvider as GenerationProvider | undefined
  const decision = resolveGenerationRoute(settings, preferredProvider)

  return NextResponse.json({
    mode: decision.mode,
    route: decision.candidates,
    resolvedAt: Date.now(),
  })
}
