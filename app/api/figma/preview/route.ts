import { NextRequest, NextResponse } from 'next/server'
import { getFigmaImage } from '@/server/figma-client'
import { getSettings } from '@/server/storage'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const fileKey = searchParams.get('fileKey')
  const nodeId = searchParams.get('nodeId')
  const format = (searchParams.get('format') || 'png') as 'png' | 'jpg' | 'svg' | 'pdf'
  const scale = parseInt(searchParams.get('scale') || '2', 10)

  if (!fileKey) {
    return NextResponse.json({ error: 'fileKey required' }, { status: 400 })
  }

  if (!nodeId) {
    return NextResponse.json({ error: 'nodeId required' }, { status: 400 })
  }

  const settings = await getSettings()
  const accessToken = settings.figmaConfig?.accessToken

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Figma not configured. Add your Figma access token in Settings.' },
      { status: 400 }
    )
  }

  try {
    const result = await getFigmaImage(fileKey, [nodeId], accessToken, format, scale)

    if (result.err) {
      return NextResponse.json({ error: result.err }, { status: 500 })
    }

    const imageUrl = result.images[nodeId]
    if (!imageUrl) {
      return NextResponse.json({ error: 'Image not found for node' }, { status: 404 })
    }

    return NextResponse.json({ imageUrl, format, scale })
  } catch (error) {
    console.error('[figma/preview] Failed to fetch image:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Figma image' },
      { status: 500 }
    )
  }
}
