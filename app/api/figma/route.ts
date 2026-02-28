import { NextRequest, NextResponse } from 'next/server'
import { getFigmaFile, parseFigmaUrl, testFigmaConnection } from '@/server/figma-client'
import { auth } from '@/auth'
import { getFigmaAccessTokenForUser } from '@/server/integrations/figma-service'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  const session = await auth().catch(() => null)
  const userId = session?.user?.id
  const accessToken = await getFigmaAccessTokenForUser(userId)

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Figma not configured. Add your Figma access token in Settings.' },
      { status: 400 }
    )
  }

  const parsed = parseFigmaUrl(url)
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid Figma URL. Expected format: figma.com/file/... or figma.com/design/...' },
      { status: 400 }
    )
  }

  try {
    const file = await getFigmaFile(parsed.fileKey, accessToken)
    return NextResponse.json({
      name: file.name,
      lastModified: file.lastModified,
      thumbnailUrl: file.thumbnailUrl,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
    })
  } catch (error) {
    console.error('[figma] Failed to fetch file:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Figma data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, accessToken } = body as { action?: string; accessToken?: string }

  if (action === 'test') {
    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 })
    }

    const result = await testFigmaConnection(accessToken)
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
