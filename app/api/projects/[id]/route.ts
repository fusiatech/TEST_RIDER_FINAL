import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getProject, saveProject, deleteProject } from '@/server/storage'
import { ProjectSchema } from '@/lib/types'
import { requirePermission } from '@/lib/permissions'
import { withValidation } from '@/lib/validation-middleware'
import { IdSchema } from '@/lib/schemas/common'

const ParamsSchema = z.object({
  id: IdSchema,
})

export const GET = withValidation(
  { params: ParamsSchema },
  async ({ params }) => {
    const project = await getProject(params.id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json(project)
  }
)

export const PUT = withValidation(
  { params: ParamsSchema, body: ProjectSchema },
  async ({ params, body }) => {
    const existing = await getProject(params.id)
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const updated = { ...body, id: params.id }
    await saveProject(updated)
    return NextResponse.json(updated)
  }
)

export const DELETE = withValidation(
  { params: ParamsSchema },
  async ({ params }) => {
    const permissionError = await requirePermission('canDeleteProjects')
    if (permissionError) return permissionError

    await deleteProject(params.id)
    return new NextResponse(null, { status: 204 })
  }
)
