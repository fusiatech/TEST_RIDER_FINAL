import { NextRequest, NextResponse } from 'next/server'
import { generatePRDPrompt, generatePRDRefinementPrompt, PRDInputSchema, validatePRDContent } from '@/lib/prd-template'
import { getProject, saveProject } from '@/server/storage'
import { runAPIAgent } from '@/server/api-runner'
import { getSettings } from '@/server/storage'
import { z } from 'zod'
import * as prdVersioning from '@/server/prd-versioning'

const GeneratePRDSchema = z.object({
  projectName: z.string(),
  description: z.string(),
  targetUsers: z.string(),
  keyFeatures: z.array(z.string()),
  constraints: z.string().optional(),
  existingContext: z.string().optional(),
})

const RefinePRDSchema = z.object({
  feedback: z.string().min(1, 'Feedback is required'),
})

const UpdatePRDSchema = z.object({
  prd: z.string().min(1, 'PRD content is required'),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
  author: z.string().optional(),
  changeLog: z.string().optional(),
  createVersion: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    const { searchParams } = new URL(request.url)
    const includeVersions = searchParams.get('includeVersions') === 'true'
    const includeSections = searchParams.get('includeSections') === 'true'
    
    const response: Record<string, unknown> = {
      prd: project.prd || null,
      status: project.prdStatus || 'draft',
      projectName: project.name,
    }
    
    if (includeVersions) {
      response.versions = await prdVersioning.getVersions(id)
    }
    
    if (includeSections) {
      response.sections = await prdVersioning.getAllSections(id)
    }
    
    const latestVersion = await prdVersioning.getLatestVersion(id)
    if (latestVersion) {
      response.currentVersion = latestVersion.version
    }
    
    return NextResponse.json(response)
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
    
    const body = await request.json()
    const result = GeneratePRDSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const input = PRDInputSchema.parse(result.data)
    const prompt = generatePRDPrompt(input)
    
    const settings = await getSettings()
    const apiKey = settings.apiKeys?.openai || process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add it in Settings.' },
        { status: 400 }
      )
    }
    
    let prdContent = ''
    
    await runAPIAgent({
      provider: 'chatgpt',
      prompt,
      apiKey,
      onOutput: (chunk) => {
        prdContent += chunk
      },
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    
    if (!prdContent) {
      return NextResponse.json(
        { error: 'Failed to generate PRD - no content received' },
        { status: 500 }
      )
    }
    
    const validation = validatePRDContent(prdContent)
    
    const updatedProject = {
      ...project,
      prd: prdContent,
      prdStatus: 'draft' as const,
      updatedAt: Date.now(),
    }
    
    await saveProject(updatedProject)
    
    const version = await prdVersioning.createVersion(
      id,
      prdContent,
      'system',
      'Initial PRD generation'
    )
    
    return NextResponse.json({
      prd: prdContent,
      status: 'draft',
      validation,
      version: version.version,
      sections: version.sections,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PRD Generation Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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
    
    const body = await request.json()
    const result = UpdatePRDSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { prd, status, author, changeLog, createVersion } = result.data
    
    const updatedProject = {
      ...project,
      prd,
      prdStatus: status || project.prdStatus || 'draft',
      updatedAt: Date.now(),
    }
    
    await saveProject(updatedProject)
    
    let version = null
    if (createVersion !== false) {
      version = await prdVersioning.createVersion(
        id,
        prd,
        author || 'user',
        changeLog || 'PRD updated'
      )
    }
    
    return NextResponse.json({
      prd: updatedProject.prd,
      status: updatedProject.prdStatus,
      version: version?.version,
      sections: version?.sections,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    if (!project.prd) {
      return NextResponse.json(
        { error: 'No existing PRD to refine' },
        { status: 400 }
      )
    }
    
    const body = await request.json()
    const result = RefinePRDSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid input: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { feedback } = result.data
    const prompt = generatePRDRefinementPrompt(project.prd, feedback)
    
    const settings = await getSettings()
    const apiKey = settings.apiKeys?.openai || process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add it in Settings.' },
        { status: 400 }
      )
    }
    
    let refinedPRD = ''
    
    await runAPIAgent({
      provider: 'chatgpt',
      prompt,
      apiKey,
      onOutput: (chunk) => {
        refinedPRD += chunk
      },
      onComplete: () => {},
      onError: (error) => {
        throw new Error(error)
      },
    })
    
    if (!refinedPRD) {
      return NextResponse.json(
        { error: 'Failed to refine PRD - no content received' },
        { status: 500 }
      )
    }
    
    const validation = validatePRDContent(refinedPRD)
    
    const updatedProject = {
      ...project,
      prd: refinedPRD,
      prdStatus: 'draft' as const,
      updatedAt: Date.now(),
    }
    
    await saveProject(updatedProject)
    
    const version = await prdVersioning.createVersion(
      id,
      refinedPRD,
      'system',
      `PRD refined based on feedback: ${feedback.substring(0, 100)}${feedback.length > 100 ? '...' : ''}`
    )
    
    return NextResponse.json({
      prd: refinedPRD,
      status: 'draft',
      validation,
      version: version.version,
      sections: version.sections,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PRD Refinement Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
