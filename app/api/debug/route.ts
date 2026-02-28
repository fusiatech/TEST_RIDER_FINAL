import { NextRequest, NextResponse } from 'next/server'
import { getDebugAdapter } from '@/server/debug-adapter'
import type { DebugConfig } from '@/lib/debug-types'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { z } from 'zod'
import path from 'node:path'

const DebugConfigSchema = z.object({
  type: z.enum(['node', 'chrome', 'python']),
  program: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  port: z.number().int().positive().optional(),
  stopOnEntry: z.boolean().optional(),
})

export async function GET() {
  try {
    const adapter = getDebugAdapter()
    const sessions = adapter.getAllSessions()
    return NextResponse.json({ sessions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get debug sessions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json()
    const parseResult = DebugConfigSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: `Invalid debug config: ${parseResult.error.message}` },
        { status: 400 }
      )
    }
    const body = parseResult.data

    if (!body.type) {
      return NextResponse.json(
        { error: 'Debug type is required' },
        { status: 400 }
      )
    }

    if (!body.program && body.type !== 'chrome') {
      return NextResponse.json(
        { error: 'Program path is required' },
        { status: 400 }
      )
    }

    const cwdRequested = body.cwd ?? process.env.PROJECT_PATH ?? process.cwd()
    const resolvedCwd = resolvePathWithinWorkspace(cwdRequested)
    if (!resolvedCwd.ok || !resolvedCwd.path) {
      return NextResponse.json(
        { error: resolvedCwd.error ?? 'Path outside workspace root' },
        { status: 403 }
      )
    }

    let program = body.program
    if (program) {
      const candidatePath = path.isAbsolute(program)
        ? path.resolve(program)
        : path.resolve(resolvedCwd.path, program)

      const resolvedProgram = resolvePathWithinWorkspace(candidatePath)
      if (!resolvedProgram.ok || !resolvedProgram.path) {
        return NextResponse.json(
          { error: resolvedProgram.error ?? 'Program path outside workspace root' },
          { status: 403 }
        )
      }
      program = resolvedProgram.path
    }

    const config: DebugConfig = {
      ...body,
      cwd: resolvedCwd.path,
      ...(program ? { program } : {}),
    }

    const adapter = getDebugAdapter()
    const session = await adapter.startSession(config)
    
    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start debug session' },
      { status: 500 }
    )
  }
}
