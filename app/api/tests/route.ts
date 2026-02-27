import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { TestRunSchema, type TestRunSource, type TestRunStatus } from '@/lib/types'
import { getTestRuns, queryTestRuns, saveTestRun } from '@/server/storage'

const QuerySchema = z.object({
  source: z.enum(['orchestrator', 'ci', 'manual']).optional(),
  status: z.enum(['passed', 'failed']).optional(),
  limit: z.coerce.number().int().positive().optional(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams
    const parsed = QuerySchema.safeParse({
      source: searchParams.get('source') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }

    const { source, status, limit } = parsed.data
    const runs = source || status || limit
      ? await queryTestRuns({
          source: source as TestRunSource | undefined,
          status: status as TestRunStatus | undefined,
          limit,
        })
      : await getTestRuns()

    return NextResponse.json(runs)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const parsed = TestRunSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 })
    }

    await saveTestRun(parsed.data)
    return NextResponse.json(parsed.data, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
