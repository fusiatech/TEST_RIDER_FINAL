#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const typesSource = readFileSync('lib/types.ts', 'utf8')
const workspaceSource = readFileSync('components/settings-workspace.tsx', 'utf8')
const panelSource = readFileSync('components/settings-panel.tsx', 'utf8')

const marker = 'export const SettingsSchema = z.object({'
const start = typesSource.indexOf(marker)
if (start === -1) {
  console.error('Could not locate SettingsSchema in lib/types.ts')
  process.exit(2)
}

const schemaTail = typesSource.slice(start + marker.length)
const end = schemaTail.indexOf('\n})')
if (end === -1) {
  console.error('Could not parse SettingsSchema block')
  process.exit(2)
}

const schemaBlock = schemaTail.slice(0, end)
const keys = [...schemaBlock.matchAll(/^  ([a-zA-Z][a-zA-Z0-9_]*):/gm)].map((match) => match[1])

const source = `${workspaceSource}\n${panelSource}`
const directCoverage = []
const uncovered = []

for (const key of keys) {
  if (source.includes(key)) {
    directCoverage.push(key)
  } else {
    uncovered.push(key)
  }
}

const hasJsonFallback = workspaceSource.includes('Advanced Settings JSON')

console.log(`Settings schema keys: ${keys.length}`)
console.log(`Directly rendered/handled keys: ${directCoverage.length}`)

if (uncovered.length === 0) {
  console.log('Coverage check passed: all settings keys are represented in settings UIs.')
  process.exit(0)
}

if (hasJsonFallback) {
  console.log('Coverage note: some keys are only available via Advanced Settings JSON fallback:')
  uncovered.forEach((key) => console.log(`- ${key}`))
  process.exit(0)
}

console.error('Coverage failed: missing settings controls for keys:')
uncovered.forEach((key) => console.error(`- ${key}`))
process.exit(1)
