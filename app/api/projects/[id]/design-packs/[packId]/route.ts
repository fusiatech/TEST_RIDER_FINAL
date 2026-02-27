import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject } from '@/server/storage'
import type { DesignPack, Project } from '@/lib/types'
import { z } from 'zod'

function getDesignPacks(project: Project): DesignPack[] {
  return (project as Project & { designPacks?: DesignPack[] }).designPacks || []
}

function setDesignPacks(project: Project, designPacks: DesignPack[]): Project {
  return { ...project, designPacks } as Project & { designPacks: DesignPack[] }
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

    const designPacks = getDesignPacks(project)
    const pack = designPacks.find((p) => p.id === packId)
    if (!pack) {
      return NextResponse.json({ error: 'Design pack not found' }, { status: 404 })
    }

    return NextResponse.json(pack)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdateDesignPackSchema = z.object({
  prdSectionId: z.string().optional().nullable(),
  figmaLinks: z.array(z.object({
    url: z.string().url().or(z.literal('')),
    nodeId: z.string(),
    name: z.string(),
  })).optional(),
  wireframes: z.array(z.string().url().or(z.literal(''))).optional(),
  mockups: z.array(z.string().url().or(z.literal(''))).optional(),
  designTokens: z.object({
    colors: z.record(z.string(), z.string()).optional(),
    spacing: z.record(z.string(), z.string()).optional(),
    typography: z.record(z.string(), z.object({
      fontFamily: z.string().optional(),
      fontSize: z.string().optional(),
      fontWeight: z.string().optional(),
      lineHeight: z.string().optional(),
      letterSpacing: z.string().optional(),
    })).optional(),
  }).optional(),
  componentSpecs: z.array(z.object({
    name: z.string(),
    props: z.record(z.string(), z.object({
      type: z.string(),
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      description: z.string().optional(),
    })).optional(),
    variants: z.array(z.object({
      name: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
  })).optional(),
  status: z.enum(['draft', 'review', 'approved']).optional(),
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
    const result = UpdateDesignPackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update: ${result.error.message}` },
        { status: 400 }
      )
    }

    const designPacks = getDesignPacks(project)
    const packIndex = designPacks.findIndex((p) => p.id === packId)
    if (packIndex === -1) {
      return NextResponse.json({ error: 'Design pack not found' }, { status: 404 })
    }

    const existingPack = designPacks[packIndex]
    const now = Date.now()

    const updatedPack: DesignPack = {
      ...existingPack,
      ...(result.data.prdSectionId !== undefined && {
        prdSectionId: result.data.prdSectionId ?? undefined,
      }),
      ...(result.data.figmaLinks && {
        figmaLinks: result.data.figmaLinks.filter((l) => l.url),
      }),
      ...(result.data.wireframes && {
        wireframes: result.data.wireframes.filter(Boolean),
      }),
      ...(result.data.mockups && {
        mockups: result.data.mockups.filter(Boolean),
      }),
      ...(result.data.designTokens !== undefined && {
        designTokens: result.data.designTokens,
      }),
      ...(result.data.componentSpecs !== undefined && {
        componentSpecs: result.data.componentSpecs,
      }),
      ...(result.data.status !== undefined && {
        status: result.data.status,
      }),
      updatedAt: now,
    }

    const updatedPacks = [...designPacks]
    updatedPacks[packIndex] = updatedPack

    const updatedProject = setDesignPacks(project, updatedPacks)
    updatedProject.updatedAt = now

    await saveProject(updatedProject)
    return NextResponse.json(updatedPack)
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

    const designPacks = getDesignPacks(project)
    const packIndex = designPacks.findIndex((p) => p.id === packId)
    if (packIndex === -1) {
      return NextResponse.json({ error: 'Design pack not found' }, { status: 404 })
    }

    const updatedPacks = designPacks.filter((p) => p.id !== packId)
    const updatedProject = setDesignPacks(project, updatedPacks)
    updatedProject.updatedAt = Date.now()

    await saveProject(updatedProject)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
