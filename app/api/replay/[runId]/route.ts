import { NextRequest, NextResponse } from 'next/server'
import { getAllReplayRuns, getReplayRun } from '@/server/storage'
import { buildReproBundle } from '@/server/replay'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<NextResponse> {
  try {
    const { runId } = await params
    let run = await getReplayRun(runId)
    if (!run) {
      const runs = await getAllReplayRuns()
      run = runs.find((r) => r.evidenceId === runId)
    }
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const shouldExport = request.nextUrl.searchParams.get('export') === '1'
    if (!shouldExport) {
      return NextResponse.json(run)
    }

    const bundle = buildReproBundle(run)
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="repro-${runId}.json"`,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
