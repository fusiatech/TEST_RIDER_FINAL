import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getArtifactsByRun, saveArtifact } from '@/server/storage'
import { getApiVersion, addVersionHeaders } from '@/lib/api-version'

const CreateArtifactSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['log', 'diff', 'test', 'screenshot', 'report', 'file', 'other']),
  ref: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const artifacts = await getArtifactsByRun(id)
    const response = NextResponse.json({
      data: artifacts,
      apiVersion: versionInfo.version,
    })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const versionInfo = getApiVersion(request)
    const { id } = await params
    const body: unknown = await request.json()
    const parsed = CreateArtifactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid artifact payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const artifact = {
      id: randomUUID(),
      runId: id,
      createdAt: Date.now(),
      ...parsed.data,
    }
    await saveArtifact(artifact)

    const response = NextResponse.json({
      data: artifact,
      apiVersion: versionInfo.version,
    }, { status: 201 })
    return addVersionHeaders(response, versionInfo)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

