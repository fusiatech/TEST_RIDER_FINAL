import { NextRequest, NextResponse } from 'next/server'
import { generatePRDPrompt, generatePRDRefinementPrompt, PRDInputSchema, validatePRDContent } from '@/lib/prd-template'
import { getProject, saveProject } from '@/server/storage'
import { getEffectiveSettingsForUser } from '@/server/storage'
import { runGenerationGateway } from '@/server/generation-gateway'
import { z } from 'zod'
import * as prdVersioning from '@/server/prd-versioning'
import { auth } from '@/auth'

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

function buildDeterministicPRD(input: z.infer<typeof GeneratePRDSchema>): string {
  const featureLines = input.keyFeatures.map((feature, index) => `${index + 1}. ${feature}`).join('\n')
  const constraints = input.constraints?.trim() || 'No explicit constraints provided.'
  const context = input.existingContext?.trim() || 'No prior context provided.'
  const now = new Date().toISOString().slice(0, 10)

  return `# Product Requirements Document

## Overview
${input.projectName} is intended for ${input.targetUsers}. This document captures a baseline, deterministic PRD draft generated without a live AI provider.

## Problem Statement
${input.description}

## Goals and Objectives
- Deliver a production-ready baseline implementation for ${input.projectName}.
- Prioritize correctness, observability, and testability.
- Keep scope aligned with user value and explicit constraints.

## User Stories
- As a ${input.targetUsers}, I want the product to solve the core problem so that I can achieve outcomes faster.
- As an operator, I want clear logs and health checks so that I can debug failures quickly.

## Functional Requirements
${featureLines || '1. Define core functionality based on project description.'}

## Non-Functional Requirements
- Performance: Core API operations should complete within acceptable latency for interactive workflows.
- Security: Input validation and least-privilege access should be enforced.
- Reliability: Failures must be observable and recoverable with retries/fallbacks.
- Maintainability: Artifacts should be versioned and auditable.

## Out of Scope
- Any requirements not listed in this baseline PRD are deferred to future revisions.

## Success Metrics
- Core flows execute end-to-end successfully.
- Generated artifacts pass schema validation and persistence checks.
- Operational alerts/logging are available for key failure modes.

## Timeline
- ${now}: Baseline deterministic PRD drafted.
- +1 sprint: Implementation of core feature set.
- +2 sprints: Hardening, testing, and release readiness.

## Constraints
${constraints}

## Existing Context
${context}
`
}

function buildDeterministicPRDRefinement(existingPRD: string, feedback: string): string {
  return `${existingPRD}

## Refinement Notes
- Feedback incorporated in deterministic mode.
- Input feedback summary: ${feedback}
- Follow-up action: run with an active provider lane for richer refinement if needed.
`
}

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
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    
    const settings = await getEffectiveSettingsForUser(session.user.id)
    const generation = await runGenerationGateway({
      prompt,
      settings,
      artifactType: 'prd',
      deterministicFallback: () => buildDeterministicPRD(result.data),
    })
    const prdContent = generation.text
    
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
      generation: generation.metadata,
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
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    const existingPrd = project.prd ?? ''
    const prompt = generatePRDRefinementPrompt(existingPrd, feedback)
    
    const settings = await getEffectiveSettingsForUser(session.user.id)
    const generation = await runGenerationGateway({
      prompt,
      settings,
      artifactType: 'prd_refine',
      deterministicFallback: () => buildDeterministicPRDRefinement(existingPrd, feedback),
    })
    const refinedPRD = generation.text
    
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
      generation: generation.metadata,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PRD Refinement Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
