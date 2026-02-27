import { NextRequest, NextResponse } from 'next/server'
import { getFigmaNode, getFigmaVariables, extractDesignTokens } from '@/server/figma-client'
import { getSettings } from '@/server/storage'
import { z } from 'zod'

const RequestSchema = z.object({
  fileKey: z.string(),
  nodeId: z.string(),
  includeVariables: z.boolean().optional(),
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

  const { fileKey, nodeId, includeVariables = true } = parsed.data

  const settings = await getSettings()
  const accessToken = settings.figmaConfig?.accessToken

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

    // Extract design tokens from the node
    const tokens = extractDesignTokens(nodeData.document)

    // Optionally fetch file-level variables
    let variables: Record<string, unknown> = {}
    if (includeVariables) {
      try {
        const variablesResponse = await getFigmaVariables(fileKey, accessToken)
        variables = variablesResponse.variables || {}

        // Convert Figma variables to design tokens
        for (const [, variable] of Object.entries(variablesResponse.variables || {})) {
          const v = variable as {
            name: string
            resolvedType: string
            valuesByMode: Record<string, unknown>
          }

          // Get the default mode value
          const defaultModeId = Object.keys(variablesResponse.variableCollections || {})[0]
          const collection = variablesResponse.variableCollections?.[defaultModeId]
          const modeId = collection?.defaultModeId || Object.keys(v.valuesByMode)[0]
          const value = v.valuesByMode[modeId]

          if (v.resolvedType === 'COLOR' && typeof value === 'object' && value !== null) {
            const color = value as { r: number; g: number; b: number; a: number }
            const r = Math.round(color.r * 255)
            const g = Math.round(color.g * 255)
            const b = Math.round(color.b * 255)
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`

            tokens.push({
              name: v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              value: hex,
              type: 'color',
              cssVar: `--${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            })
          } else if (v.resolvedType === 'FLOAT' && typeof value === 'number') {
            tokens.push({
              name: v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
              value: `${value}px`,
              type: 'spacing',
              cssVar: `--${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            })
          }
        }
      } catch (err) {
        console.warn('[figma/tokens] Failed to fetch variables:', err)
      }
    }

    // Deduplicate tokens by name
    const uniqueTokens = Array.from(
      new Map(tokens.map((t) => [t.name, t])).values()
    )

    // Generate CSS output
    const cssVariables = uniqueTokens
      .filter((t) => t.cssVar)
      .map((t) => `  ${t.cssVar}: ${t.value};`)
      .join('\n')

    const css = `:root {\n${cssVariables}\n}`

    return NextResponse.json({
      tokens: uniqueTokens,
      css,
      nodeName: nodeData.document.name,
      variableCount: Object.keys(variables).length,
    })
  } catch (error) {
    console.error('[figma/tokens] Failed to extract tokens:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to extract design tokens' },
      { status: 500 }
    )
  }
}
