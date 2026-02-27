import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateCode, validateCodeSnippet } from '@/server/code-validator'
import type { CodeValidationResult } from '@/server/code-validator'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

const ValidateRequestSchema = z.object({
  projectPath: z.string().min(1),
  files: z.array(z.string()).optional(),
  skipLint: z.boolean().optional(),
  skipTypeCheck: z.boolean().optional(),
})

const ValidateSnippetSchema = z.object({
  code: z.string(),
  language: z.enum(['typescript', 'javascript']).optional(),
})

/**
 * POST /api/validate
 *
 * Run code validation on a project or code snippet.
 *
 * For project validation:
 * {
 *   "projectPath": "/path/to/project",
 *   "files": ["src/file.ts"],  // optional: specific files to lint
 *   "skipLint": false,         // optional: skip ESLint
 *   "skipTypeCheck": false     // optional: skip TypeScript
 * }
 *
 * For snippet validation:
 * {
 *   "code": "const x: string = 123",
 *   "language": "typescript"
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()

    const snippetResult = ValidateSnippetSchema.safeParse(body)
    if (snippetResult.success && snippetResult.data.code) {
      const { code, language = 'typescript' } = snippetResult.data
      const result = validateCodeSnippet(code, language)
      return NextResponse.json({
        isValid: result.isValid,
        typeErrors: [],
        lintErrors: [],
        syntaxErrors: result.errors,
        score: result.isValid ? 100 : Math.max(0, 100 - result.errors.length * 15),
      } satisfies CodeValidationResult)
    }

    const projectResult = ValidateRequestSchema.safeParse(body)
    if (!projectResult.success) {
      return NextResponse.json(
        { error: `Invalid request: ${projectResult.error.message}` },
        { status: 400 }
      )
    }

    const { projectPath, files, skipLint, skipTypeCheck } = projectResult.data
    const resolved = resolvePathWithinWorkspace(projectPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 }
      )
    }

    const validationResult = await validateCode(resolved.path, {
      files,
      skipLint,
      skipTypeCheck,
    })

    return NextResponse.json(validationResult)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/validate?projectPath=/path/to/project
 *
 * Quick validation check for a project.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const projectPath = searchParams.get('projectPath')

    if (!projectPath) {
      return NextResponse.json(
        { error: 'Missing projectPath query parameter' },
        { status: 400 }
      )
    }

    const resolved = resolvePathWithinWorkspace(projectPath)
    if (!resolved.ok || !resolved.path) {
      return NextResponse.json(
        { error: resolved.error ?? 'Path outside workspace root' },
        { status: 403 }
      )
    }

    const result = await validateCode(resolved.path)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
