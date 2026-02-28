#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'

const ROOTS = ['app', 'components', 'public']
const IGNORE_PATHS = new Set([
  path.normalize('components/notification-preferences.tsx'),
])
const FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.css',
  '.md',
  '.txt',
  '.svg',
])

async function walk(dir, acc) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    const relative = path.normalize(path.relative(process.cwd(), absolute))
    if (relative.includes(`${path.sep}node_modules${path.sep}`)) continue
    if (IGNORE_PATHS.has(relative)) continue

    if (entry.isDirectory()) {
      await walk(absolute, acc)
      continue
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
    acc.push({ absolute, relative })
  }
}

function findMatches(content) {
  const lines = content.split(/\r?\n/)
  const results = []
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('SwarmUI')) {
      results.push({ line: i + 1, text: lines[i].trim() })
    }
  }
  return results
}

async function run() {
  const files = []
  for (const root of ROOTS) {
    const absolute = path.join(process.cwd(), root)
    try {
      await fs.access(absolute)
      await walk(absolute, files)
    } catch {
      // Skip missing roots in partial workspaces.
    }
  }

  const hits = []
  for (const file of files) {
    const content = await fs.readFile(file.absolute, 'utf8')
    const matches = findMatches(content)
    for (const match of matches) {
      hits.push(`${file.relative}:${match.line}: ${match.text}`)
    }
  }

  if (hits.length > 0) {
    console.error('Brand audit failed. Found "SwarmUI" in runtime-facing files:')
    for (const hit of hits) {
      console.error(hit)
    }
    process.exit(1)
  }

  console.log('Brand audit passed: no runtime-facing "SwarmUI" strings found.')
}

run().catch((error) => {
  console.error('Brand audit error:', error instanceof Error ? error.message : String(error))
  process.exit(2)
})
