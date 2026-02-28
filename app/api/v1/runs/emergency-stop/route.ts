import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { jobQueue } from '@/server/job-queue'
import { auditEmergencyStop } from '@/lib/audit'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

const EmergencyStopSchema = z.object({
  reason: z.string().max(500).optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const payload = EmergencyStopSchema.safeParse(await request.json().catch(() => ({})))
    if (!payload.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const reason = payload.data.reason ?? 'api-emergency-stop'
    const result = await jobQueue.emergencyStop(reason)
    await auditEmergencyStop(reason)

    const response = NextResponse.json({
      ok: true,
      reason,
      ...result,
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

