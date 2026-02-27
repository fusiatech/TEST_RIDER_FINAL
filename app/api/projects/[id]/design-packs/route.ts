import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject } from '@/server/storage'
import type { DesignPack, Project } from '@/lib/types'
import { z } from 'zod'

const CreateDesignPackSchema = z.object({
  ticketId: z.string().min(1, 'Ticket ID is required'),
  prdSectionId: z.string().optional(),
  figmaLinks: z.array(z.object({
    url: z.string().url().or(z.literal('')),
    nodeId: z.string(),
    name: z.string(),
  })).default([]),
  wireframes: z.array(z.string().url().or(z.literal(''))).default([]),
  mockups: z.array(z.string().url().or(z.literal(''))).default([]),
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
  })).default([]),
  status: z.enum(['draft', 'review', 'approved']).default('draft'),
})

function getDesignPacks(project: Project): DesignPack[] {
  return (project as Project & { designPacks?: DesignPack[] }).designPacks || []
}

function setDesignPacks(project: Project, designPacks: DesignPack[]): Project {
  return { ...project, designPacks } as Project & { designPacks: DesignPack[] }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const designPacks = getDesignPacks(project)
    return NextResponse.json(designPacks)
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
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const result = CreateDesignPackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid design pack: ${result.error.message}` },
        { status: 400 }
      )
    }

    const ticket = project.tickets.find((t) => t.id === result.data.ticketId)
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const now = Date.now()
    const newPack: DesignPack = {
      id: crypto.randomUUID(),
      ticketId: result.data.ticketId,
      prdSectionId: result.data.prdSectionId,
      figmaLinks: result.data.figmaLinks.filter((l) => l.url),
      wireframes: result.data.wireframes.filter(Boolean),
      mockups: result.data.mockups.filter(Boolean),
      designTokens: result.data.designTokens,
      componentSpecs: result.data.componentSpecs,
      status: result.data.status,
      createdAt: now,
      updatedAt: now,
    }

    const designPacks = getDesignPacks(project)
    const updatedProject = setDesignPacks(project, [...designPacks, newPack])
    updatedProject.updatedAt = now

    await saveProject(updatedProject)
    return NextResponse.json(newPack, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdateDesignPackSchema = z.object({
  packId: z.string(),
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
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
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
    const packIndex = designPacks.findIndex((p) => p.id === result.data.packId)
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

const DeleteDesignPackSchema = z.object({
  packId: z.string(),
})

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const result = DeleteDesignPackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const designPacks = getDesignPacks(project)
    const packIndex = designPacks.findIndex((p) => p.id === result.data.packId)
    if (packIndex === -1) {
      return NextResponse.json({ error: 'Design pack not found' }, { status: 404 })
    }

    const updatedPacks = designPacks.filter((p) => p.id !== result.data.packId)
    const updatedProject = setDesignPacks(project, updatedPacks)
    updatedProject.updatedAt = Date.now()

    await saveProject(updatedProject)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
