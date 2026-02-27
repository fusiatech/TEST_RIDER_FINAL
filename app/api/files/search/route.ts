import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'

interface SearchResult {
  filePath: string
  fileName: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  'coverage',
  '.turbo',
  '__pycache__',
  '.venv',
  'venv',
])

const SEARCHABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.xml', '.svg',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.txt',
  '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.gql',
  '.env', '.env.example', '.env.local',
  '.gitignore', '.dockerignore',
  'Dockerfile', 'Makefile',
])

const MAX_RESULTS = 100
const MAX_FILE_SIZE = 1024 * 1024 // 1MB

async function searchInFile(
  filePath: string,
  query: string,
  results: SearchResult[]
): Promise<void> {
  if (results.length >= MAX_RESULTS) return

  try {
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_FILE_SIZE) return

    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const lowerQuery = query.toLowerCase()

    for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
      const line = lines[i]
      const lowerLine = line.toLowerCase()
      let searchIndex = 0

      while (searchIndex < line.length && results.length < MAX_RESULTS) {
        const matchIndex = lowerLine.indexOf(lowerQuery, searchIndex)
        if (matchIndex === -1) break

        results.push({
          filePath,
          fileName: path.basename(filePath),
          lineNumber: i + 1,
          lineContent: line,
          matchStart: matchIndex,
          matchEnd: matchIndex + query.length,
        })

        searchIndex = matchIndex + 1
      }
    }
  } catch {
    // Skip files that can't be read
  }
}

async function searchDirectory(
  dirPath: string,
  query: string,
  results: SearchResult[]
): Promise<void> {
  if (results.length >= MAX_RESULTS) return

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break

      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await searchDirectory(fullPath, query, results)
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        const isSearchable =
          SEARCHABLE_EXTENSIONS.has(ext) ||
          SEARCHABLE_EXTENSIONS.has(entry.name) ||
          (!ext && !entry.name.startsWith('.'))

        if (isSearchable) {
          await searchInFile(fullPath, query, results)
        }
      }
    }
  } catch {
    // Skip directories that can't be read
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const projectPath = searchParams.get('path')

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  if (!projectPath) {
    return NextResponse.json({ error: 'Project path required' }, { status: 400 })
  }

  const resolved = resolvePathWithinWorkspace(projectPath)
  if (!resolved.ok || !resolved.path) {
    return NextResponse.json(
      { error: resolved.error ?? 'Path outside workspace root' },
      { status: 403 }
    )
  }

  try {
    const stat = await fs.stat(resolved.path)
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Invalid project path' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Project path not found' }, { status: 404 })
  }

  const results: SearchResult[] = []
  await searchDirectory(resolved.path, query.trim(), results)

  return NextResponse.json({ results })
}
