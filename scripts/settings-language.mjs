#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const source = readFileSync('components/settings-workspace.tsx', 'utf8')

const forbiddenUiPhrases = [
  /CLI Agents/i,
  /Custom CLI/i,
  /CLI detected/i,
  /CLI not detected/i,
  /Cursor CLI/i,
  /enable CLI/i,
]

const violations = forbiddenUiPhrases
  .map((pattern) => ({ pattern, match: source.match(pattern) }))
  .filter((entry) => entry.match)

if (violations.length > 0) {
  console.error('Settings language audit failed. Found deprecated user-facing terms:')
  for (const violation of violations) {
    console.error(`- ${violation.pattern}`)
  }
  process.exit(1)
}

console.log('Settings language audit passed.')
