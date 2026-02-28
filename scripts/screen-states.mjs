#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'

const requiredFiles = [
  'app/loading.tsx',
  'app/error.tsx',
  'app/not-found.tsx',
  'components/ui/loading-state.tsx',
  'components/ui/error-state.tsx',
  'components/ui/empty-state.tsx',
  'components/ui/no-data-state.tsx',
  'components/ui/offline-state.tsx',
]

const missing = requiredFiles.filter((file) => !existsSync(file))
if (missing.length > 0) {
  console.error('Screen states audit failed. Missing files:')
  for (const file of missing) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

const usageChecks = [
  { file: 'components/live-preview.tsx', marker: 'NoDataState' },
  { file: 'components/live-preview.tsx', marker: 'ErrorState' },
  { file: 'components/observability-dashboard.tsx', marker: 'OfflineState' },
  { file: 'components/observability-dashboard.tsx', marker: 'ErrorState' },
]

const missingUsage = usageChecks.filter(({ file, marker }) => {
  const src = readFileSync(file, 'utf8')
  return !src.includes(marker)
})

if (missingUsage.length > 0) {
  console.error('Screen states audit failed. Missing expected usage markers:')
  for (const entry of missingUsage) {
    console.error(`- ${entry.file}: ${entry.marker}`)
  }
  process.exit(1)
}

console.log('Screen states audit passed.')
