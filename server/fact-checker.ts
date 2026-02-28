/**
 * Fact verification system for agent outputs.
 *
 * Verifies file paths and function/class names mentioned in agent outputs
 * by checking if they actually exist in the project.
 */

import * as fs from 'fs'
import * as path from 'path'

/* ── Types ────────────────────────────────────────────────────────── */

export interface VerifiedFact {
  type: 'file' | 'function' | 'class' | 'import' | 'package'
  reference: string
  exists: boolean
  location?: string
}

export interface UnverifiedFact {
  type: 'file' | 'function' | 'class' | 'import' | 'package'
  reference: string
  reason: string
}

export interface FactCheckResult {
  isValid: boolean
  score: number
  verifiedFacts: VerifiedFact[]
  unverifiedFacts: UnverifiedFact[]
  errors: string[]
}

/* ── Regex Patterns ────────────────────────────────────────────────── */

const FILE_PATH_PATTERNS = [
  /(?:^|\s|["'`(])([A-Za-z]:\\(?:[\w.@\-]+\\)*[\w.@\-]+\.\w+)/g,
  /(?:^|\s|["'`(])(\/(?:[\w.@\-]+\/)*[\w.@\-]+\.\w+)/g,
  /(?:^|\s|["'`(])(\.\.?\/(?:[\w.@\-]+\/)*[\w.@\-]+\.\w+)/g,
  /(?:^|\s|["'`(])([\w.@\-]+\/(?:[\w.@\-]+\/)*[\w.@\-]+\.\w+)/g,
]

const FUNCTION_PATTERNS = [
  /(?:^|\s)function\s+([a-zA-Z_$][\w$]*)\s*\(/gm,
  /(?:^|\s)const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm,
  /(?:^|\s)const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?function/gm,
  /(?:^|\s)export\s+(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/gm,
  /(?:^|\s)export\s+const\s+([a-zA-Z_$][\w$]*)\s*=/gm,
  /(?:^|\s)async\s+function\s+([a-zA-Z_$][\w$]*)/gm,
  /(?:^|\s)def\s+([a-zA-Z_][\w]*)\s*\(/gm,
]

const CLASS_PATTERNS = [
  /(?:^|\s)class\s+([A-Z][\w]*)/gm,
  /(?:^|\s)export\s+class\s+([A-Z][\w]*)/gm,
  /(?:^|\s)export\s+default\s+class\s+([A-Z][\w]*)/gm,
  /(?:^|\s)abstract\s+class\s+([A-Z][\w]*)/gm,
]

const IMPORT_PATTERNS = [
  /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+['"]([^'"]+)['"]\s+import/g,
]

const PACKAGE_PATTERNS = [
  /(?:^|\s|["'`])(@?[\w\-]+(?:\/[\w\-]+)?)\s*(?:@[\d.]+)?(?:\s|$|["'`])/g,
]

/* ── Extraction Functions ────────────────────────────────────────── */

export function extractFilePaths(text: string): string[] {
  const paths = new Set<string>()

  for (const pattern of FILE_PATH_PATTERNS) {
    pattern.lastIndex = 0
    let match = pattern.exec(text)
    while (match !== null) {
      const filePath = match[1].trim()
      if (filePath && isValidFilePath(filePath)) {
        paths.add(filePath)
      }
      match = pattern.exec(text)
    }
  }

  return [...paths]
}

export function extractCodeReferences(text: string): string[] {
  const references = new Set<string>()

  for (const pattern of [...FUNCTION_PATTERNS, ...CLASS_PATTERNS]) {
    pattern.lastIndex = 0
    let match = pattern.exec(text)
    while (match !== null) {
      const name = match[1]?.trim()
      if (name && isValidIdentifier(name)) {
        references.add(name)
      }
      match = pattern.exec(text)
    }
  }

  return [...references]
}

export function extractImports(text: string): string[] {
  const imports = new Set<string>()

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match = pattern.exec(text)
    while (match !== null) {
      const importPath = match[1]?.trim()
      if (importPath) {
        imports.add(importPath)
      }
      match = pattern.exec(text)
    }
  }

  return [...imports]
}

export function extractPackageReferences(text: string): string[] {
  const packages = new Set<string>()
  const commonPackages = new Set([
    'react', 'next', 'typescript', 'eslint', 'prettier', 'jest', 'vitest',
    'tailwindcss', 'zod', 'zustand', 'axios', 'lodash', 'express', 'fastify',
    'prisma', 'drizzle', 'trpc', 'graphql', 'apollo', 'webpack', 'vite',
    'rollup', 'esbuild', 'swc', 'babel', 'postcss', 'sass', 'less',
  ])

  for (const pattern of PACKAGE_PATTERNS) {
    pattern.lastIndex = 0
    let match = pattern.exec(text)
    while (match !== null) {
      const pkg = match[1]?.trim().toLowerCase()
      if (pkg && commonPackages.has(pkg)) {
        packages.add(pkg)
      }
      match = pattern.exec(text)
    }
  }

  return [...packages]
}

/* ── Validation Helpers ────────────────────────────────────────────── */

function isValidFilePath(filePath: string): boolean {
  if (filePath.length < 3 || filePath.length > 500) return false
  if (/^(http|https|ftp|mailto|tel):/.test(filePath)) return false
  if (/\s{2,}/.test(filePath)) return false
  const ext = path.extname(filePath)
  if (!ext || ext.length > 10) return false
  return true
}

function isValidIdentifier(name: string): boolean {
  if (name.length < 2 || name.length > 100) return false
  if (/^[0-9]/.test(name)) return false
  if (/^(if|else|for|while|do|switch|case|break|continue|return|function|class|const|let|var|import|export|default|async|await|try|catch|finally|throw|new|this|super|extends|implements|interface|type|enum|namespace|module|declare|abstract|static|public|private|protected|readonly|get|set|true|false|null|undefined|void|never|any|unknown|number|string|boolean|object|symbol|bigint)$/.test(name)) return false
  return /^[a-zA-Z_$][\w$]*$/.test(name)
}

/* ── Verification Functions ────────────────────────────────────────── */

export async function verifyFilePath(
  filePath: string,
  projectPath: string,
): Promise<boolean> {
  try {
    const normalizedPath = filePath.replace(/\\/g, '/')
    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.join(projectPath, normalizedPath)

    return fs.existsSync(absolutePath)
  } catch {
    return false
  }
}

export async function verifyCodeReference(
  name: string,
  projectPath: string,
): Promise<VerifiedFact | null> {
  try {
    const searchPatterns = [
      new RegExp(`function\\s+${escapeRegex(name)}\\s*\\(`, 'g'),
      new RegExp(`const\\s+${escapeRegex(name)}\\s*=`, 'g'),
      new RegExp(`class\\s+${escapeRegex(name)}\\b`, 'g'),
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${escapeRegex(name)}`, 'g'),
      new RegExp(`export\\s+class\\s+${escapeRegex(name)}`, 'g'),
      new RegExp(`export\\s+const\\s+${escapeRegex(name)}`, 'g'),
      new RegExp(`def\\s+${escapeRegex(name)}\\s*\\(`, 'g'),
    ]

    const result = await searchInProject(projectPath, searchPatterns)

    if (result) {
      const isClass = /^[A-Z]/.test(name)
      return {
        type: isClass ? 'class' : 'function',
        reference: name,
        exists: true,
        location: result,
      }
    }

    return {
      type: /^[A-Z]/.test(name) ? 'class' : 'function',
      reference: name,
      exists: false,
    }
  } catch {
    return null
  }
}

export async function verifyImport(
  importPath: string,
  projectPath: string,
): Promise<VerifiedFact> {
  if (importPath.startsWith('.') || importPath.startsWith('/') || importPath.startsWith('@/')) {
    const resolvedPath = resolveImportPath(importPath, projectPath)
    const exists = resolvedPath ? fs.existsSync(resolvedPath) : false
    return {
      type: 'import',
      reference: importPath,
      exists,
      location: exists ? (resolvedPath ?? undefined) : undefined,
    }
  }

  const packageJsonPath = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      }
      const packageName = importPath.startsWith('@')
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0]

      const exists = packageName in deps
      return {
        type: 'package',
        reference: importPath,
        exists,
        location: exists ? `package.json (${deps[packageName]})` : undefined,
      }
    } catch {
      // Fall through
    }
  }

  return {
    type: 'import',
    reference: importPath,
    exists: false,
  }
}

/* ── Search Helpers ────────────────────────────────────────────────── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function resolveImportPath(importPath: string, projectPath: string): string | null {
  let resolved = importPath

  if (resolved.startsWith('@/')) {
    resolved = resolved.replace('@/', './')
  }

  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

  for (const ext of extensions) {
    const fullPath = path.join(projectPath, resolved + ext)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  return null
}

async function searchInProject(
  projectPath: string,
  patterns: RegExp[],
): Promise<string | null> {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java']
  const ignoreDirs = ['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv']

  const searchDir = async (dir: string, depth: number = 0): Promise<string | null> => {
    if (depth > 5) return null

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (ignoreDirs.includes(entry.name)) continue
          const result = await searchDir(path.join(dir, entry.name), depth + 1)
          if (result) return result
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name)
          if (!extensions.includes(ext)) continue

          const filePath = path.join(dir, entry.name)
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            for (const pattern of patterns) {
              pattern.lastIndex = 0
              if (pattern.test(content)) {
                return filePath
              }
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }

    return null
  }

  return searchDir(projectPath)
}

/* ── Main Fact Check Function ────────────────────────────────────── */

export async function factCheckOutput(
  output: string,
  projectPath: string,
): Promise<FactCheckResult> {
  const verifiedFacts: VerifiedFact[] = []
  const unverifiedFacts: UnverifiedFact[] = []
  const errors: string[] = []

  if (!output || output.trim().length < 20) {
    return {
      isValid: true,
      score: 100,
      verifiedFacts: [],
      unverifiedFacts: [],
      errors: [],
    }
  }

  if (!projectPath || !fs.existsSync(projectPath)) {
    return {
      isValid: false,
      score: 0,
      verifiedFacts: [],
      unverifiedFacts: [],
      errors: ['Project path does not exist'],
    }
  }

  const filePaths = extractFilePaths(output)
  for (const filePath of filePaths) {
    try {
      const exists = await verifyFilePath(filePath, projectPath)
      if (exists) {
        verifiedFacts.push({
          type: 'file',
          reference: filePath,
          exists: true,
          location: filePath,
        })
      } else {
        unverifiedFacts.push({
          type: 'file',
          reference: filePath,
          reason: 'File not found in project',
        })
      }
    } catch (err) {
      errors.push(`Error verifying file ${filePath}: ${err}`)
    }
  }

  const codeRefs = extractCodeReferences(output)
  const uniqueRefs = [...new Set(codeRefs)].slice(0, 20)

  for (const ref of uniqueRefs) {
    try {
      const result = await verifyCodeReference(ref, projectPath)
      if (result) {
        if (result.exists) {
          verifiedFacts.push(result)
        } else {
          unverifiedFacts.push({
            type: result.type,
            reference: ref,
            reason: 'Definition not found in project',
          })
        }
      }
    } catch (err) {
      errors.push(`Error verifying code reference ${ref}: ${err}`)
    }
  }

  const imports = extractImports(output)
  for (const importPath of imports.slice(0, 30)) {
    try {
      const result = await verifyImport(importPath, projectPath)
      if (result.exists) {
        verifiedFacts.push(result)
      } else {
        unverifiedFacts.push({
          type: result.type,
          reference: importPath,
          reason: 'Import not found',
        })
      }
    } catch (err) {
      errors.push(`Error verifying import ${importPath}: ${err}`)
    }
  }

  const totalFacts = verifiedFacts.length + unverifiedFacts.length
  let score: number

  if (totalFacts === 0) {
    score = 100
  } else {
    const verifiedCount = verifiedFacts.filter((f) => f.exists).length
    score = Math.round((verifiedCount / totalFacts) * 100)
  }

  const isValid = score >= 50

  return {
    isValid,
    score,
    verifiedFacts,
    unverifiedFacts,
    errors,
  }
}

export function computeFactCheckPenalty(result: FactCheckResult): number {
  if (result.score >= 80) return 0
  if (result.score >= 60) return 5
  if (result.score >= 40) return 15
  if (result.score >= 20) return 25
  return 35
}

export function shouldEscalateForInsufficientEvidence(
  result: FactCheckResult,
  minScore: number = 50,
): boolean {
  if (result.errors.length > 0) {
    return true
  }
  if (result.score < minScore) {
    return true
  }
  if (result.verifiedFacts.length === 0 && result.unverifiedFacts.length > 0) {
    return true
  }
  return false
}

/* ── GAP-013: Tool-Backed Verification Enhancement ────────────────── */

export interface APIVerificationResult {
  endpoint: string
  claim: string
  verified: boolean
  actualResponse?: string
  error?: string
}

export interface CommandVerificationResult {
  command: string
  expectedOutput: string
  actualOutput: string
  verified: boolean
  exitCode: number
}

export interface ExternalSourceVerificationResult {
  url: string
  claim: string
  verified: boolean
  relevantContent?: string
  error?: string
}

/**
 * GAP-013: Verify an API endpoint claim by checking if the endpoint exists
 * and optionally checking the response structure.
 */
export async function verifyAPICall(
  claim: string,
  projectPath: string,
): Promise<APIVerificationResult> {
  const endpointPattern = /(?:GET|POST|PUT|DELETE|PATCH)\s+([\/\w\-\[\]\.]+)/i
  const match = endpointPattern.exec(claim)
  
  if (!match) {
    return {
      endpoint: '',
      claim,
      verified: false,
      error: 'No API endpoint pattern found in claim',
    }
  }
  
  const endpoint = match[1]
  
  const apiRoutePath = path.join(projectPath, 'app', 'api')
  if (!fs.existsSync(apiRoutePath)) {
    return {
      endpoint,
      claim,
      verified: false,
      error: 'No app/api directory found',
    }
  }
  
  const routeParts = endpoint.split('/').filter(Boolean)
  let currentPath = apiRoutePath
  let found = false
  
  for (const part of routeParts) {
    const dynamicPart = part.startsWith('[') ? part : null
    const staticPath = path.join(currentPath, part)
    const dynamicPath = dynamicPart ? path.join(currentPath, dynamicPart) : null
    
    if (fs.existsSync(staticPath)) {
      currentPath = staticPath
      found = true
    } else if (dynamicPath && fs.existsSync(dynamicPath)) {
      currentPath = dynamicPath
      found = true
    } else {
      const entries = fs.existsSync(currentPath) 
        ? fs.readdirSync(currentPath, { withFileTypes: true })
        : []
      const dynamicDir = entries.find(
        (e) => e.isDirectory() && e.name.startsWith('[') && e.name.endsWith(']')
      )
      if (dynamicDir) {
        currentPath = path.join(currentPath, dynamicDir.name)
        found = true
      } else {
        found = false
        break
      }
    }
  }
  
  if (found) {
    const routeFile = path.join(currentPath, 'route.ts')
    const routeFileJs = path.join(currentPath, 'route.js')
    if (fs.existsSync(routeFile) || fs.existsSync(routeFileJs)) {
      return {
        endpoint,
        claim,
        verified: true,
        actualResponse: `Route file found at ${currentPath}`,
      }
    }
  }
  
  return {
    endpoint,
    claim,
    verified: false,
    error: `API route not found for endpoint: ${endpoint}`,
  }
}

/**
 * GAP-013: Verify a command output claim by running the command
 * and comparing the output.
 */
export async function verifyCommandOutput(
  command: string,
  expectedOutput: string,
  projectPath: string,
  timeoutMs: number = 10000,
): Promise<CommandVerificationResult> {
  const { execSync } = await import('node:child_process')
  
  const dangerousPatterns = [
    /rm\s+-rf/i,
    /rmdir/i,
    /del\s+\/[sfq]/i,
    /format/i,
    /mkfs/i,
    /dd\s+if=/i,
    />\s*\/dev\//i,
    /curl.*\|.*sh/i,
    /wget.*\|.*sh/i,
  ]
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        command,
        expectedOutput,
        actualOutput: '',
        verified: false,
        exitCode: -1,
      }
    }
  }
  
  const safeCommands = [
    /^(ls|dir|cat|head|tail|grep|find|echo|pwd|cd|npm\s+(list|ls|version|--version)|node\s+--version|git\s+(status|log|branch|diff|show)|tsc\s+--version|npx\s+--version)/i,
  ]
  
  const isSafe = safeCommands.some((pattern) => pattern.test(command.trim()))
  if (!isSafe) {
    return {
      command,
      expectedOutput,
      actualOutput: '',
      verified: false,
      exitCode: -1,
    }
  }
  
  try {
    const actualOutput = execSync(command, {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    
    const normalizedExpected = expectedOutput.trim().toLowerCase()
    const normalizedActual = actualOutput.toLowerCase()
    
    const verified = 
      normalizedActual.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedActual) ||
      similarity(normalizedExpected, normalizedActual) > 0.7
    
    return {
      command,
      expectedOutput,
      actualOutput,
      verified,
      exitCode: 0,
    }
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string }
    return {
      command,
      expectedOutput,
      actualOutput: error.stderr || error.stdout || '',
      verified: false,
      exitCode: error.status ?? 1,
    }
  }
}

/**
 * GAP-013: Verify a claim against an external source URL.
 * Note: This is a limited implementation that checks if the URL is accessible
 * and contains relevant keywords from the claim.
 */
export async function verifyExternalSource(
  url: string,
  claim: string,
): Promise<ExternalSourceVerificationResult> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return {
      url,
      claim,
      verified: false,
      error: 'Invalid URL format',
    }
  }
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'SwarmUI-FactChecker/1.0',
        'Accept': 'text/html,application/json,text/plain',
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      return {
        url,
        claim,
        verified: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }
    
    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()
    
    const claimKeywords = claim
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 10)
    
    const contentLower = text.toLowerCase()
    const matchedKeywords = claimKeywords.filter((kw) => contentLower.includes(kw))
    const matchRatio = matchedKeywords.length / claimKeywords.length
    
    const verified = matchRatio >= 0.3
    
    const relevantStart = contentLower.indexOf(matchedKeywords[0] || '')
    const relevantContent = relevantStart >= 0
      ? text.slice(Math.max(0, relevantStart - 50), relevantStart + 200)
      : text.slice(0, 200)
    
    return {
      url,
      claim,
      verified,
      relevantContent: relevantContent + (text.length > 200 ? '...' : ''),
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      url,
      claim,
      verified: false,
      error: `Fetch failed: ${message}`,
    }
  }
}

function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0
  
  const wordsA = new Set(a.split(/\s+/))
  const wordsB = new Set(b.split(/\s+/))
  
  const intersection = new Set([...wordsA].filter((x) => wordsB.has(x)))
  const union = new Set([...wordsA, ...wordsB])
  
  return intersection.size / union.size
}

/**
 * GAP-013: Enhanced fact check that includes tool-backed verification.
 */
export async function enhancedFactCheck(
  output: string,
  projectPath: string,
): Promise<FactCheckResult & {
  apiVerifications: APIVerificationResult[]
  commandVerifications: CommandVerificationResult[]
  externalVerifications: ExternalSourceVerificationResult[]
}> {
  const baseResult = await factCheckOutput(output, projectPath)
  
  const apiVerifications: APIVerificationResult[] = []
  const commandVerifications: CommandVerificationResult[] = []
  const externalVerifications: ExternalSourceVerificationResult[] = []
  
  const apiPattern = /(?:GET|POST|PUT|DELETE|PATCH)\s+([\/\w\-\[\]\.]+)/gi
  let apiMatch
  while ((apiMatch = apiPattern.exec(output)) !== null) {
    const result = await verifyAPICall(apiMatch[0], projectPath)
    apiVerifications.push(result)
  }
  
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi
  let urlMatch
  const seenUrls = new Set<string>()
  while ((urlMatch = urlPattern.exec(output)) !== null) {
    const url = urlMatch[0].replace(/[.,;:!?)]+$/, '')
    if (!seenUrls.has(url) && seenUrls.size < 5) {
      seenUrls.add(url)
      const surroundingText = output.slice(
        Math.max(0, urlMatch.index - 100),
        urlMatch.index + url.length + 100
      )
      const result = await verifyExternalSource(url, surroundingText)
      externalVerifications.push(result)
    }
  }
  
  const verifiedAPIs = apiVerifications.filter((v) => v.verified).length
  const verifiedExternal = externalVerifications.filter((v) => v.verified).length
  const totalToolVerifications = apiVerifications.length + externalVerifications.length
  
  let adjustedScore = baseResult.score
  if (totalToolVerifications > 0) {
    const toolScore = ((verifiedAPIs + verifiedExternal) / totalToolVerifications) * 100
    adjustedScore = Math.round((baseResult.score * 0.7) + (toolScore * 0.3))
  }
  
  return {
    ...baseResult,
    score: adjustedScore,
    isValid: adjustedScore >= 50,
    apiVerifications,
    commandVerifications,
    externalVerifications,
  }
}
