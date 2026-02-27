import { NextRequest, NextResponse } from 'next/server'
import { getDebugAdapter } from '@/server/debug-adapter'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const adapter = getDebugAdapter()
    const session = adapter.getSession(id)
    
    if (!session) {
      return NextResponse.json(
        { error: 'Debug session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ session })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get debug session' },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const adapter = getDebugAdapter()
    await adapter.stopSession(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop debug session' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json() as { action: string; frameId?: number; expression?: string }
    const adapter = getDebugAdapter()
    
    const session = adapter.getSession(id)
    if (!session) {
      return NextResponse.json(
        { error: 'Debug session not found' },
        { status: 404 }
      )
    }

    switch (body.action) {
      case 'continue':
        await adapter.continue(id)
        return NextResponse.json({ success: true })
      
      case 'pause':
        await adapter.pause(id)
        return NextResponse.json({ success: true })
      
      case 'stepOver':
        await adapter.stepOver(id)
        return NextResponse.json({ success: true })
      
      case 'stepInto':
        await adapter.stepInto(id)
        return NextResponse.json({ success: true })
      
      case 'stepOut':
        await adapter.stepOut(id)
        return NextResponse.json({ success: true })
      
      case 'getCallStack':
        const callStack = await adapter.getCallStack(id)
        return NextResponse.json({ callStack })
      
      case 'getScopes':
        if (body.frameId === undefined) {
          return NextResponse.json({ error: 'frameId is required' }, { status: 400 })
        }
        const scopes = await adapter.getScopes(id, body.frameId)
        return NextResponse.json({ scopes })
      
      case 'getVariables':
        if (body.frameId === undefined) {
          return NextResponse.json({ error: 'scopeReference is required' }, { status: 400 })
        }
        const variables = await adapter.getVariables(id, body.frameId)
        return NextResponse.json({ variables })
      
      case 'evaluate':
        if (!body.expression) {
          return NextResponse.json({ error: 'expression is required' }, { status: 400 })
        }
        const result = await adapter.evaluate(id, body.expression, body.frameId)
        return NextResponse.json({ result })
      
      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute debug action' },
      { status: 500 }
    )
  }
}
