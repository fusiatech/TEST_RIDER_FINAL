import { NextRequest, NextResponse } from 'next/server'
import { getFigmaNode, getFigmaImage, generateReactCode } from '@/server/figma-client'
import { z } from 'zod'
import { auth } from '@/auth'
import { getFigmaAccessTokenForUser } from '@/server/integrations/figma-service'

const RequestSchema = z.object({
  fileKey: z.string(),
  nodeId: z.string(),
  clientLanguages: z.string().optional(),
  clientFrameworks: z.string().optional(),
  useTailwind: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = RequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { fileKey, nodeId, useTailwind = true } = parsed.data

  const session = await auth().catch(() => null)
  const userId = session?.user?.id
  const accessToken = await getFigmaAccessTokenForUser(userId)

  if (!accessToken) {
    return NextResponse.json(
      { error: 'Figma not configured. Add your Figma access token in Settings.' },
      { status: 400 }
    )
  }

  try {
    // Fetch the node data
    const nodeResponse = await getFigmaNode(fileKey, nodeId, accessToken)
    const nodeData = nodeResponse.nodes[nodeId]

    if (!nodeData) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    // Generate React code from the node
    const generated = generateReactCode(nodeData.document, { useTailwind })

    // Fetch images for any image fills (assets)
    const assets: Record<string, string> = {}

    // Find all nodes with image fills
    function findImageNodes(node: typeof nodeData.document, images: string[]) {
      if (node.fills) {
        for (const fill of node.fills) {
          if (fill.type === 'IMAGE' && fill.imageRef) {
            images.push(node.id)
            break
          }
        }
      }
      if (node.children) {
        for (const child of node.children) {
          findImageNodes(child as typeof node, images)
        }
      }
    }

    const imageNodeIds: string[] = []
    findImageNodes(nodeData.document, imageNodeIds)

    if (imageNodeIds.length > 0) {
      try {
        const imageResponse = await getFigmaImage(fileKey, imageNodeIds, accessToken, 'png', 2)
        for (const [id, url] of Object.entries(imageResponse.images)) {
          if (url) {
            assets[`image-${id}`] = url
          }
        }
      } catch (err) {
        console.warn('[figma/code] Failed to fetch images:', err)
      }
    }

    return NextResponse.json({
      code: generated.code,
      language: generated.language,
      framework: generated.framework,
      assets: { ...generated.assets, ...assets },
      nodeName: nodeData.document.name,
      nodeType: nodeData.document.type,
    })
  } catch (error) {
    console.error('[figma/code] Failed to generate code:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate code' },
      { status: 500 }
    )
  }
}
