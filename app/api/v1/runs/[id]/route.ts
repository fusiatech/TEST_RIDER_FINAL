import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/server/job-queue'
import { auditJobCancel } from '@/lib/audit'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const run = await jobQueue.getJob(id)
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    const response = NextResponse.json({
      ...run,
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const run = await jobQueue.getJob(id)
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    await jobQueue.cancelJob(id)
    await auditJobCancel(id)
    const response = NextResponse.json({
      ok: true,
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

