import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { auditJobCancel } from '@/lib/audit'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const cancelled = await jobQueue.cancelJob(id)
    if (!cancelled) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    await auditJobCancel(id)
    const response = NextResponse.json({ ok: true, runId: id, apiVersion: versionInfo.version })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

