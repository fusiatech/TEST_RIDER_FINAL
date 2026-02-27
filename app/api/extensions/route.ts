import { NextRequest, NextResponse } from 'next/server'
import {
  getExtensions,
  installExtensionFromPath,
  installExtensionFromUrl,
  uninstallExtension,
  getExtensionActivationStatus,
  getExtensionActivationError,
} from '@/server/extension-manager'
import { ExtensionInstallRequestSchema } from '@/lib/extensions'

export async function GET(): Promise<NextResponse> {
  try {
    const extensions = await getExtensions()
    const extensionsWithStatus = extensions.map((ext) => ({
      ...ext,
      activationStatus: getExtensionActivationStatus(ext.id),
      activationError: getExtensionActivationError(ext.id),
    }))
    return NextResponse.json({ extensions: extensionsWithStatus })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json()
    const result = ExtensionInstallRequestSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }
    
    const { source, url, path: localPath } = result.data
    
    let extension
    
    switch (source) {
      case 'url':
        if (!url) {
          return NextResponse.json(
            { error: 'URL is required for URL installation' },
            { status: 400 }
          )
        }
        extension = await installExtensionFromUrl(url)
        break
        
      case 'local':
        if (!localPath) {
          return NextResponse.json(
            { error: 'Path is required for local installation' },
            { status: 400 }
          )
        }
        extension = await installExtensionFromPath(localPath)
        break
        
      case 'registry':
        return NextResponse.json(
          { error: 'Registry installation not yet implemented' },
          { status: 501 }
        )
        
      default:
        return NextResponse.json(
          { error: 'Invalid installation source' },
          { status: 400 }
        )
    }
    
    return NextResponse.json({ extension }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Extension ID is required' },
        { status: 400 }
      )
    }
    
    const success = await uninstallExtension(id)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Extension not found or could not be uninstalled' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
