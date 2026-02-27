import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  TicketTemplateSchema,
  TicketTemplateCategorySchema,
  TicketLevel,
  type TicketTemplate,
} from '@/lib/types'
import {
  getAllTemplates,
  getTemplatesByLevel,
  getTemplatesByCategory,
  getCustomTemplates,
  addCustomTemplate,
  setCustomTemplates,
} from '@/lib/ticket-templates'
import { getDb } from '@/server/storage'

async function loadCustomTemplates(): Promise<void> {
  try {
    const db = await getDb()
    const stored = db.data.ticketTemplates
    if (stored && Array.isArray(stored)) {
      setCustomTemplates(stored)
    }
  } catch {
    // Ignore errors, use in-memory templates
  }
}

async function saveCustomTemplates(): Promise<void> {
  try {
    const db = await getDb()
    db.data.ticketTemplates = getCustomTemplates()
    await db.write()
  } catch {
    // Ignore errors
  }
}

const QuerySchema = z.object({
  level: TicketLevel.optional(),
  category: TicketTemplateCategorySchema.optional(),
  includeBuiltIn: z.enum(['true', 'false']).optional(),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await loadCustomTemplates()

    const { searchParams } = new URL(request.url)
    const query = QuerySchema.safeParse({
      level: searchParams.get('level') || undefined,
      category: searchParams.get('category') || undefined,
      includeBuiltIn: searchParams.get('includeBuiltIn') || undefined,
    })

    if (!query.success) {
      return NextResponse.json(
        { error: `Invalid query: ${query.error.message}` },
        { status: 400 }
      )
    }

    let templates: TicketTemplate[]

    if (query.data.includeBuiltIn === 'false') {
      templates = getCustomTemplates()
    } else if (query.data.level) {
      templates = getTemplatesByLevel(query.data.level)
    } else if (query.data.category) {
      templates = getTemplatesByCategory(query.data.category)
    } else {
      templates = getAllTemplates()
    }

    return NextResponse.json({
      templates,
      total: templates.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const CreateTemplateSchema = TicketTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  id: z.string().optional(),
})

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await loadCustomTemplates()

    const body: unknown = await request.json()
    const result = CreateTemplateSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid template: ${result.error.message}` },
        { status: 400 }
      )
    }

    const now = Date.now()
    const template: TicketTemplate = {
      ...result.data,
      id: result.data.id || `template-${now}-${Math.random().toString(36).slice(2, 9)}`,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    }

    const existingTemplates = getAllTemplates()
    const duplicate = existingTemplates.find(
      t => t.name.toLowerCase() === template.name.toLowerCase() && t.id !== template.id
    )
    if (duplicate) {
      return NextResponse.json(
        { error: `Template with name "${template.name}" already exists` },
        { status: 409 }
      )
    }

    addCustomTemplate(template)
    await saveCustomTemplates()

    return NextResponse.json(template, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const UpdateTemplateSchema = z.object({
  id: z.string(),
  updates: TicketTemplateSchema.partial().omit({ id: true, isDefault: true }),
})

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    await loadCustomTemplates()

    const body: unknown = await request.json()
    const result = UpdateTemplateSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid update: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { id, updates } = result.data

    const existingTemplate = getAllTemplates().find(t => t.id === id)
    if (!existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (existingTemplate.isDefault) {
      return NextResponse.json(
        { error: 'Cannot modify built-in templates' },
        { status: 403 }
      )
    }

    if (updates.name) {
      const duplicate = getAllTemplates().find(
        t => t.name.toLowerCase() === updates.name!.toLowerCase() && t.id !== id
      )
      if (duplicate) {
        return NextResponse.json(
          { error: `Template with name "${updates.name}" already exists` },
          { status: 409 }
        )
      }
    }

    const customTemplates = getCustomTemplates()
    const index = customTemplates.findIndex(t => t.id === id)
    if (index === -1) {
      return NextResponse.json(
        { error: 'Cannot modify built-in templates' },
        { status: 403 }
      )
    }

    const updatedTemplate: TicketTemplate = {
      ...customTemplates[index],
      ...updates,
      id,
      isDefault: false,
      updatedAt: Date.now(),
    }

    customTemplates[index] = updatedTemplate
    setCustomTemplates(customTemplates)
    await saveCustomTemplates()

    return NextResponse.json(updatedTemplate)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const DeleteTemplateSchema = z.object({
  id: z.string(),
})

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    await loadCustomTemplates()

    const body: unknown = await request.json()
    const result = DeleteTemplateSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { id } = result.data

    const existingTemplate = getAllTemplates().find(t => t.id === id)
    if (!existingTemplate) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    if (existingTemplate.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete built-in templates' },
        { status: 403 }
      )
    }

    const customTemplates = getCustomTemplates()
    const index = customTemplates.findIndex(t => t.id === id)
    if (index === -1) {
      return NextResponse.json(
        { error: 'Cannot delete built-in templates' },
        { status: 403 }
      )
    }

    customTemplates.splice(index, 1)
    setCustomTemplates(customTemplates)
    await saveCustomTemplates()

    return NextResponse.json({ success: true, id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
