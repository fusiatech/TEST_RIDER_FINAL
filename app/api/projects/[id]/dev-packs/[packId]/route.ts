import { NextRequest, NextResponse } from 'next/server'
import { getProject, getDb } from '@/server/storage'
import type { DevPack } from '@/lib/types'
import { z } from 'zod'
import { escapeHTML } from '@/lib/sanitize'

interface DevPacksStore {
  devPacks: Record<string, DevPack[]>
}

async function getDevPacksStore(): Promise<DevPacksStore> {
  const db = await getDb()
  const data = db.data as unknown as { devPacks?: Record<string, DevPack[]> }
  if (!data.devPacks) {
    data.devPacks = {}
  }
  return { devPacks: data.devPacks }
}

async function saveDevPacksStore(projectId: string, devPacks: DevPack[]): Promise<void> {
  const db = await getDb()
  const data = db.data as unknown as { devPacks?: Record<string, DevPack[]> }
  if (!data.devPacks) {
    data.devPacks = {}
  }
  data.devPacks[projectId] = devPacks
  await db.write()
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
): Promise<NextResponse> {
  try {
    const { id, packId } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const store = await getDevPacksStore()
    const devPacks = store.devPacks[id] || []
    const devPack = devPacks.find((dp) => dp.id === packId)

    if (!devPack) {
      return NextResponse.json({ error: 'Dev pack not found' }, { status: 404 })
    }

    return NextResponse.json(devPack)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdateDevPackSchema = z.object({
  architectureDiagram: z.string().optional(),
  apiSpecs: z.array(z.object({
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    requestSchema: z.record(z.unknown()).optional(),
    responseSchema: z.record(z.unknown()).optional(),
    description: z.string().optional(),
  })).optional(),
  databaseSchema: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  implementationNotes: z.string().optional(),
  testPlan: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']).optional(),
    steps: z.array(z.string()).optional(),
    expectedResult: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  })).optional(),
  status: z.enum(['draft', 'review', 'approved']).optional(),
  prdSectionId: z.string().optional().nullable(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
): Promise<NextResponse> {
  try {
    const { id, packId } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const result = UpdateDevPackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const store = await getDevPacksStore()
    const devPacks = store.devPacks[id] || []
    const devPackIndex = devPacks.findIndex((dp) => dp.id === packId)

    if (devPackIndex === -1) {
      return NextResponse.json({ error: 'Dev pack not found' }, { status: 404 })
    }

    const existingDevPack = devPacks[devPackIndex]
    const updates = result.data
    const now = Date.now()

    const updatedDevPack: DevPack = {
      ...existingDevPack,
      ...(updates.architectureDiagram !== undefined && {
        architectureDiagram: updates.architectureDiagram,
      }),
      ...(updates.apiSpecs !== undefined && {
        apiSpecs: updates.apiSpecs,
      }),
      ...(updates.databaseSchema !== undefined && {
        databaseSchema: updates.databaseSchema,
      }),
      ...(updates.techStack !== undefined && {
        techStack: updates.techStack.map(escapeHTML),
      }),
      ...(updates.dependencies !== undefined && {
        dependencies: updates.dependencies.map(escapeHTML),
      }),
      ...(updates.implementationNotes !== undefined && {
        implementationNotes: updates.implementationNotes,
      }),
      ...(updates.testPlan !== undefined && {
        testPlan: updates.testPlan,
      }),
      ...(updates.status !== undefined && {
        status: updates.status,
      }),
      ...(updates.prdSectionId !== undefined && {
        prdSectionId: updates.prdSectionId ?? undefined,
      }),
      updatedAt: now,
    }

    devPacks[devPackIndex] = updatedDevPack
    await saveDevPacksStore(id, devPacks)

    return NextResponse.json(updatedDevPack)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
): Promise<NextResponse> {
  try {
    const { id, packId } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const store = await getDevPacksStore()
    const devPacks = store.devPacks[id] || []
    const devPackIndex = devPacks.findIndex((dp) => dp.id === packId)

    if (devPackIndex === -1) {
      return NextResponse.json({ error: 'Dev pack not found' }, { status: 404 })
    }

    devPacks.splice(devPackIndex, 1)
    await saveDevPacksStore(id, devPacks)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> }
): Promise<NextResponse> {
  return PUT(request, { params })
}
