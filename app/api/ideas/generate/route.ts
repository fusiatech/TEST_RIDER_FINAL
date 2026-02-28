import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { generateId } from '@/lib/utils'

const IDEA_TEMPLATES = [
  { title: 'Guided onboarding copilot', description: 'Adaptive onboarding flow that changes technical depth by experience level.', complexity: 'M' },
  { title: 'Test impact analyzer', description: 'Rank impacted test suites from changed files and suggest focused execution plans.', complexity: 'L' },
  { title: 'Prompt policy linter', description: 'Validate prompt packs against style, safety, and routing policy before activation.', complexity: 'S' },
  { title: 'Release risk cockpit', description: 'Unified quality and operations signals with release blockers and mitigation actions.', complexity: 'L' },
  { title: 'Context budget optimizer', description: 'Compress context windows with selective evidence retention and traceability.', complexity: 'M' },
  { title: 'AI-assisted migration planner', description: 'Generate phased migration plans with rollback checkpoints and acceptance gates.', complexity: 'XL' },
] as const

function generateIdeas(count: number) {
  const shuffled = [...IDEA_TEMPLATES].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map((template) => ({
    id: generateId(),
    ...template,
  }))
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const countParam = Number(request.nextUrl.searchParams.get('count') ?? '5')
  const count = Number.isFinite(countParam) ? Math.min(Math.max(Math.trunc(countParam), 1), 12) : 5
  return NextResponse.json({
    ideas: generateIdeas(count),
    generatedAt: Date.now(),
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let count = 5
  try {
    const body = (await request.json()) as { count?: number } | null
    if (body?.count && Number.isFinite(body.count)) {
      count = Math.min(Math.max(Math.trunc(body.count), 1), 12)
    }
  } catch {
    // Keep default count when body is empty/non-JSON.
  }

  return NextResponse.json({
    ideas: generateIdeas(count),
    generatedAt: Date.now(),
  })
}
