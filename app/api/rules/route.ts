import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getUserRules, saveUserRules } from '@/server/storage'

const RuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  applicability: z.enum(['always', 'manual', 'model_decision', 'file_pattern', 'off']),
  enabled: z.boolean(),
  filePattern: z.string().optional(),
  modelIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  updatedAt: z.number().int().nonnegative(),
})

const RulesPayloadSchema = z.object({
  rules: z.array(RuleSchema),
})

export async function GET(): Promise<NextResponse> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rules = await getUserRules(userId)
  return NextResponse.json({ rules })
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const json: unknown = await request.json()
  const parsed = RulesPayloadSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  }

  const normalizedRules = parsed.data.rules.map((rule) => ({
    ...rule,
    updatedAt: Date.now(),
  }))
  await saveUserRules(userId, normalizedRules)
  return NextResponse.json({ rules: normalizedRules })
}

