import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { auditJobResume } from '@/lib/audit'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const resumed = await jobQueue.resumeJob(id)
    if (!resumed) {
      return NextResponse.json({ error: 'Run cannot be resumed in current state' }, { status: 409 })
    }
    await auditJobResume(id)
    const response = NextResponse.json({ ok: true, runId: id, apiVersion: versionInfo.version })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

