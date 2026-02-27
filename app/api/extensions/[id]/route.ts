import { NextRequest, NextResponse } from 'next/server'
import {
  getExtension,
  enableExtension,
  disableExtension,
  setExtensionConfig,
  activateExtension,
  deactivateExtension,
  getExtensionActivationStatus,
  getExtensionActivationError,
} from '@/server/extension-manager'
import {
  ExtensionUpdateRequestSchema,
  ExtensionActivateRequestSchema,
} from '@/lib/extensions'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params
    const extension = await getExtension(id)
    
    if (!extension) {
      return NextResponse.json(
        { error: 'Extension not found' },
        { status: 404 }
      )
    }
    
    const activationStatus = getExtensionActivationStatus(id)
    const activationError = getExtensionActivationError(id)
    
    return NextResponse.json({
      extension,
      activationStatus,
      activationError,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params
    const body: unknown = await request.json()
    const result = ExtensionUpdateRequestSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { enabled, config } = result.data
    let extension = await getExtension(id)
    
    if (!extension) {
      return NextResponse.json(
        { error: 'Extension not found' },
        { status: 404 }
      )
    }
    
    if (enabled !== undefined) {
      const updated = enabled
        ? await enableExtension(id)
        : await disableExtension(id)
      if (updated) extension = updated
    }
    
    if (config !== undefined && extension) {
      const updated = await setExtensionConfig(id, config)
      if (updated) extension = updated
    }
    
    const activationStatus = getExtensionActivationStatus(id)
    const activationError = getExtensionActivationError(id)
    
    return NextResponse.json({
      extension,
      activationStatus,
      activationError,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params
    const body: unknown = await request.json()
    const result = ExtensionActivateRequestSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { action } = result.data
    const extension = await getExtension(id)
    
    if (!extension) {
      return NextResponse.json(
        { error: 'Extension not found' },
        { status: 404 }
      )
    }
    
    let activationResult: { success: boolean; error?: string }
    
    if (action === 'activate') {
      activationResult = await activateExtension(id)
    } else {
      activationResult = await deactivateExtension(id)
    }
    
    const activationStatus = getExtensionActivationStatus(id)
    const activationError = getExtensionActivationError(id)
    
    return NextResponse.json({
      extension,
      activationStatus,
      activationError,
      success: activationResult.success,
      error: activationResult.error,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
