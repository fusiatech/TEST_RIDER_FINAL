const FIGMA_API_BASE = 'https://api.figma.com/v1'

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface FigmaFileResponse {
  name: string
  lastModified: string
  thumbnailUrl: string
  version: string
  document: FigmaDocument
}

export interface FigmaDocument {
  id: string
  name: string
  type: string
  children?: FigmaDocument[]
}

export interface FigmaNodeResponse {
  name: string
  nodes: Record<string, { document: FigmaNode }>
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  fills?: FigmaFill[]
  strokes?: FigmaStroke[]
  effects?: FigmaEffect[]
  style?: FigmaTextStyle
  characters?: string
  cornerRadius?: number
  rectangleCornerRadii?: number[]
  constraints?: { vertical: string; horizontal: string }
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  primaryAxisSizingMode?: 'FIXED' | 'AUTO'
  counterAxisSizingMode?: 'FIXED' | 'AUTO'
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  itemSpacing?: number
  opacity?: number
  visible?: boolean
  blendMode?: string
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'IMAGE'
  visible?: boolean
  opacity?: number
  color?: FigmaColor
  gradientStops?: { position: number; color: FigmaColor }[]
  imageRef?: string
  scaleMode?: 'FILL' | 'FIT' | 'TILE' | 'STRETCH'
}

export interface FigmaStroke {
  type: 'SOLID' | 'GRADIENT_LINEAR'
  visible?: boolean
  opacity?: number
  color?: FigmaColor
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  visible?: boolean
  radius?: number
  color?: FigmaColor
  offset?: { x: number; y: number }
  spread?: number
}

export interface FigmaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface FigmaTextStyle {
  fontFamily?: string
  fontPostScriptName?: string
  fontWeight?: number
  fontSize?: number
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM'
  letterSpacing?: number
  lineHeightPx?: number
  lineHeightPercent?: number
  lineHeightPercentFontSize?: number
  lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%'
}

export interface FigmaImageResponse {
  images: Record<string, string>
  err: string | null
}

export interface FigmaStylesResponse {
  styles: Record<string, FigmaStyleMetadata>
}

export interface FigmaStyleMetadata {
  key: string
  name: string
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'
  description?: string
}

export interface FigmaVariablesResponse {
  variables: Record<string, FigmaVariable>
  variableCollections: Record<string, FigmaVariableCollection>
}

export interface FigmaVariable {
  id: string
  name: string
  key: string
  variableCollectionId: string
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR'
  valuesByMode: Record<string, unknown>
}

export interface FigmaVariableCollection {
  id: string
  name: string
  key: string
  modes: { modeId: string; name: string }[]
  defaultModeId: string
}

export interface DesignToken {
  name: string
  value: string
  type: 'color' | 'spacing' | 'typography' | 'other'
  cssVar?: string
}

export interface GeneratedCode {
  code: string
  language: string
  framework: string
  assets: Record<string, string>
}

/* ── API Functions ─────────────────────────────────────────────────────── */

export async function getFigmaFile(
  fileKey: string,
  accessToken: string
): Promise<FigmaFileResponse> {
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}`, {
    headers: { 'X-Figma-Token': accessToken },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Figma file: ${error}`)
  }
  return res.json() as Promise<FigmaFileResponse>
}

export async function getFigmaFileWithDepth(
  fileKey: string,
  accessToken: string,
  depth: number = 2
): Promise<FigmaFileResponse> {
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}?depth=${depth}`, {
    headers: { 'X-Figma-Token': accessToken },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Figma file: ${error}`)
  }
  return res.json() as Promise<FigmaFileResponse>
}

export async function getFigmaNode(
  fileKey: string,
  nodeId: string,
  accessToken: string
): Promise<FigmaNodeResponse> {
  const res = await fetch(
    `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`,
    {
      headers: { 'X-Figma-Token': accessToken },
    }
  )
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Figma node: ${error}`)
  }
  return res.json() as Promise<FigmaNodeResponse>
}

export async function getFigmaImage(
  fileKey: string,
  nodeIds: string[],
  accessToken: string,
  format: 'png' | 'jpg' | 'svg' | 'pdf' = 'png',
  scale: number = 2
): Promise<FigmaImageResponse> {
  const ids = nodeIds.join(',')
  const res = await fetch(
    `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`,
    {
      headers: { 'X-Figma-Token': accessToken },
    }
  )
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Figma image: ${error}`)
  }
  return res.json() as Promise<FigmaImageResponse>
}

export async function getFigmaStyles(
  fileKey: string,
  accessToken: string
): Promise<FigmaStylesResponse> {
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}/styles`, {
    headers: { 'X-Figma-Token': accessToken },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Figma styles: ${error}`)
  }
  return res.json() as Promise<FigmaStylesResponse>
}

export async function getFigmaVariables(
  fileKey: string,
  accessToken: string
): Promise<FigmaVariablesResponse> {
  const res = await fetch(`${FIGMA_API_BASE}/files/${fileKey}/variables/local`, {
    headers: { 'X-Figma-Token': accessToken },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Figma variables: ${error}`)
  }
  return res.json() as Promise<FigmaVariablesResponse>
}

export async function getTeamProjects(
  teamId: string,
  accessToken: string
): Promise<{ projects: { id: string; name: string }[] }> {
  const res = await fetch(`${FIGMA_API_BASE}/teams/${teamId}/projects`, {
    headers: { 'X-Figma-Token': accessToken },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch team projects: ${error}`)
  }
  return res.json() as Promise<{ projects: { id: string; name: string }[] }>
}

export async function getProjectFiles(
  projectId: string,
  accessToken: string
): Promise<{ files: { key: string; name: string; thumbnail_url: string; last_modified: string }[] }> {
  const res = await fetch(`${FIGMA_API_BASE}/projects/${projectId}/files`, {
    headers: { 'X-Figma-Token': accessToken },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch project files: ${error}`)
  }
  return res.json() as Promise<{ files: { key: string; name: string; thumbnail_url: string; last_modified: string }[] }>
}

/* ── URL Parsing ───────────────────────────────────────────────────────── */

export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string; branchKey?: string } | null {
  // Handle branch URLs: figma.com/design/:fileKey/branch/:branchKey/:fileName
  const branchMatch = url.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)\/branch\/([a-zA-Z0-9]+)/)
  if (branchMatch) {
    const nodeMatch = url.match(/node-id=([^&]+)/)
    const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ':') : undefined
    return { fileKey: branchMatch[3], branchKey: branchMatch[2], nodeId }
  }

  // Handle regular URLs: figma.com/design/:fileKey/:fileName
  const fileMatch = url.match(/figma\.com\/(file|design|board)\/([a-zA-Z0-9]+)/)
  if (!fileMatch) return null

  const fileKey = fileMatch[2]
  const nodeMatch = url.match(/node-id=([^&]+)/)
  const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ':') : undefined

  return { fileKey, nodeId }
}

/* ── Connection Test ───────────────────────────────────────────────────── */

export async function testFigmaConnection(
  accessToken: string
): Promise<{ success: boolean; message: string; user?: { handle?: string; email?: string } }> {
  try {
    const res = await fetch(`${FIGMA_API_BASE}/me`, {
      headers: { 'X-Figma-Token': accessToken },
    })

    if (res.ok) {
      const data = (await res.json()) as { handle?: string; email?: string }
      return {
        success: true,
        message: `Connected as ${data.handle || data.email || 'Figma user'}`,
        user: data,
      }
    }

    if (res.status === 403) {
      return { success: false, message: 'Invalid or expired access token' }
    }

    const error = await res.text()
    return { success: false, message: `Figma API error: ${error}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, message: `Connection failed: ${message}` }
  }
}

/* ── Design Token Extraction ───────────────────────────────────────────── */

export function extractDesignTokens(node: FigmaNode): DesignToken[] {
  const tokens: DesignToken[] = []
  const seenNames = new Set<string>()

  function addToken(token: DesignToken) {
    if (!seenNames.has(token.name)) {
      seenNames.add(token.name)
      tokens.push(token)
    }
  }

  function processNode(n: FigmaNode) {
    // Extract colors from fills
    if (n.fills) {
      for (const fill of n.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          const hex = rgbaToHex(fill.color)
          const name = sanitizeTokenName(`${n.name}-fill`)
          addToken({
            name,
            value: hex,
            type: 'color',
            cssVar: `--${name}`,
          })
        }
      }
    }

    // Extract colors from strokes
    if (n.strokes) {
      for (const stroke of n.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
          const hex = rgbaToHex(stroke.color)
          const name = sanitizeTokenName(`${n.name}-stroke`)
          addToken({
            name,
            value: hex,
            type: 'color',
            cssVar: `--${name}`,
          })
        }
      }
    }

    // Extract typography
    if (n.style && n.type === 'TEXT') {
      const style = n.style
      if (style.fontFamily && style.fontSize) {
        const name = sanitizeTokenName(`${n.name}-font`)
        addToken({
          name,
          value: `${style.fontWeight || 400} ${style.fontSize}px ${style.fontFamily}`,
          type: 'typography',
          cssVar: `--${name}`,
        })
      }
    }

    // Extract spacing from auto-layout
    if (n.layoutMode && n.layoutMode !== 'NONE') {
      if (n.itemSpacing !== undefined) {
        const name = sanitizeTokenName(`${n.name}-gap`)
        addToken({
          name,
          value: `${n.itemSpacing}px`,
          type: 'spacing',
          cssVar: `--${name}`,
        })
      }
      if (n.paddingLeft !== undefined || n.paddingTop !== undefined) {
        const padding = [
          n.paddingTop ?? 0,
          n.paddingRight ?? 0,
          n.paddingBottom ?? 0,
          n.paddingLeft ?? 0,
        ]
        const name = sanitizeTokenName(`${n.name}-padding`)
        addToken({
          name,
          value: padding.map((p) => `${p}px`).join(' '),
          type: 'spacing',
          cssVar: `--${name}`,
        })
      }
    }

    // Extract border radius
    if (n.cornerRadius !== undefined && n.cornerRadius > 0) {
      const name = sanitizeTokenName(`${n.name}-radius`)
      addToken({
        name,
        value: `${n.cornerRadius}px`,
        type: 'other',
        cssVar: `--${name}`,
      })
    }

    // Extract shadows
    if (n.effects) {
      for (const effect of n.effects) {
        if ((effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') && effect.visible !== false) {
          const name = sanitizeTokenName(`${n.name}-shadow`)
          const color = effect.color ? rgbaToHex(effect.color) : '#000000'
          const x = effect.offset?.x ?? 0
          const y = effect.offset?.y ?? 0
          const blur = effect.radius ?? 0
          const spread = effect.spread ?? 0
          const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''
          addToken({
            name,
            value: `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`,
            type: 'other',
            cssVar: `--${name}`,
          })
        }
      }
    }

    // Process children
    if (n.children) {
      for (const child of n.children) {
        processNode(child)
      }
    }
  }

  processNode(node)
  return tokens
}

/* ── Code Generation ───────────────────────────────────────────────────── */

export function generateReactCode(node: FigmaNode, options: { useTailwind?: boolean } = {}): GeneratedCode {
  const { useTailwind = true } = options
  const assets: Record<string, string> = {}
  let componentCount = 0

  function generateComponent(n: FigmaNode, depth: number = 0): string {
    const indent = '  '.repeat(depth)
    const childIndent = '  '.repeat(depth + 1)

    // Determine element type
    let element = 'div'
    if (n.type === 'TEXT') element = 'span'
    if (n.type === 'VECTOR' || n.type === 'BOOLEAN_OPERATION') element = 'svg'

    // Generate styles/classes
    const styles = generateStyles(n, useTailwind)
    const styleAttr = useTailwind
      ? styles.classes ? ` className="${styles.classes}"` : ''
      : styles.inline ? ` style={${JSON.stringify(styles.inline)}}` : ''

    // Handle text nodes
    if (n.type === 'TEXT' && n.characters) {
      return `${indent}<${element}${styleAttr}>${escapeJsx(n.characters)}</${element}>`
    }

    // Handle nodes with children
    if (n.children && n.children.length > 0) {
      const childrenCode = n.children
        .filter((c) => c.visible !== false)
        .map((c) => generateComponent(c, depth + 1))
        .join('\n')
      return `${indent}<${element}${styleAttr}>\n${childrenCode}\n${indent}</${element}>`
    }

    // Self-closing for empty nodes
    return `${indent}<${element}${styleAttr} />`
  }

  function generateStyles(n: FigmaNode, tailwind: boolean): { classes?: string; inline?: Record<string, string> } {
    if (tailwind) {
      const classes: string[] = []

      // Layout
      if (n.layoutMode === 'HORIZONTAL') classes.push('flex', 'flex-row')
      if (n.layoutMode === 'VERTICAL') classes.push('flex', 'flex-col')

      // Alignment
      if (n.primaryAxisAlignItems === 'CENTER') classes.push('justify-center')
      if (n.primaryAxisAlignItems === 'MAX') classes.push('justify-end')
      if (n.primaryAxisAlignItems === 'SPACE_BETWEEN') classes.push('justify-between')
      if (n.counterAxisAlignItems === 'CENTER') classes.push('items-center')
      if (n.counterAxisAlignItems === 'MAX') classes.push('items-end')

      // Spacing
      if (n.itemSpacing) classes.push(`gap-${Math.round(n.itemSpacing / 4)}`)
      if (n.paddingTop || n.paddingBottom || n.paddingLeft || n.paddingRight) {
        const pt = n.paddingTop ? `pt-${Math.round(n.paddingTop / 4)}` : ''
        const pb = n.paddingBottom ? `pb-${Math.round(n.paddingBottom / 4)}` : ''
        const pl = n.paddingLeft ? `pl-${Math.round(n.paddingLeft / 4)}` : ''
        const pr = n.paddingRight ? `pr-${Math.round(n.paddingRight / 4)}` : ''
        classes.push(...[pt, pb, pl, pr].filter(Boolean))
      }

      // Border radius
      if (n.cornerRadius) {
        const r = Math.round(n.cornerRadius / 4)
        classes.push(r <= 1 ? 'rounded-sm' : r <= 2 ? 'rounded' : r <= 3 ? 'rounded-md' : r <= 4 ? 'rounded-lg' : 'rounded-xl')
      }

      // Size
      if (n.absoluteBoundingBox) {
        const { width, height } = n.absoluteBoundingBox
        if (n.primaryAxisSizingMode === 'FIXED') classes.push(`w-[${Math.round(width)}px]`)
        if (n.counterAxisSizingMode === 'FIXED') classes.push(`h-[${Math.round(height)}px]`)
      }

      // Background color
      if (n.fills && n.fills[0]?.type === 'SOLID' && n.fills[0].color) {
        const hex = rgbaToHex(n.fills[0].color)
        classes.push(`bg-[${hex}]`)
      }

      return { classes: classes.join(' ') }
    }

    // Inline styles
    const inline: Record<string, string> = {}

    if (n.layoutMode === 'HORIZONTAL') {
      inline.display = 'flex'
      inline.flexDirection = 'row'
    }
    if (n.layoutMode === 'VERTICAL') {
      inline.display = 'flex'
      inline.flexDirection = 'column'
    }

    if (n.itemSpacing) inline.gap = `${n.itemSpacing}px`
    if (n.paddingTop) inline.paddingTop = `${n.paddingTop}px`
    if (n.paddingBottom) inline.paddingBottom = `${n.paddingBottom}px`
    if (n.paddingLeft) inline.paddingLeft = `${n.paddingLeft}px`
    if (n.paddingRight) inline.paddingRight = `${n.paddingRight}px`
    if (n.cornerRadius) inline.borderRadius = `${n.cornerRadius}px`

    if (n.absoluteBoundingBox) {
      inline.width = `${Math.round(n.absoluteBoundingBox.width)}px`
      inline.height = `${Math.round(n.absoluteBoundingBox.height)}px`
    }

    if (n.fills && n.fills[0]?.type === 'SOLID' && n.fills[0].color) {
      inline.backgroundColor = rgbaToHex(n.fills[0].color)
    }

    return { inline }
  }

  const componentName = sanitizeComponentName(node.name)
  const jsx = generateComponent(node, 2)

  const code = `import React from 'react'

export function ${componentName}() {
  return (
${jsx}
  )
}
`

  return {
    code,
    language: 'typescript',
    framework: 'react',
    assets,
  }
}

/* ── Utility Functions ─────────────────────────────────────────────────── */

function rgbaToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const a = color.a

  if (a < 1) {
    const alpha = Math.round(a * 255).toString(16).padStart(2, '0')
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${alpha}`
  }

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function sanitizeTokenName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeComponentName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
    .replace(/^[0-9]/, '_$&')
}

function escapeJsx(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;')
}
