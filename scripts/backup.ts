#!/usr/bin/env npx tsx
/**
 * SwarmUI Database Backup Script
 * 
 * Creates timestamped backups of the database file with metadata.
 * Automatically cleans up old backups to maintain storage limits.
 * 
 * Usage:
 *   npx tsx scripts/backup.ts
 *   npx tsx scripts/backup.ts --backup-dir ./my-backups
 *   npx tsx scripts/backup.ts --keep 14
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'

const BACKUP_VERSION = '1.0'
const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || './backups'
const DEFAULT_DATA_FILE = process.env.DATA_FILE || './db.json'
const DEFAULT_KEEP_COUNT = parseInt(process.env.BACKUP_KEEP_COUNT || '7', 10)

interface BackupMetadata {
  version: string
  timestamp: string
  createdAt: number
  sourceFile: string
  checksum: string
  recordCounts: {
    sessions: number
    projects: number
    jobs: number
    scheduledTasks: number
    evidence: number
    testRuns: number
    extensions: number
    users: number
  }
}

interface BackupFile {
  version: string
  metadata: BackupMetadata
  data: unknown
}

function parseArgs(): { backupDir: string; dataFile: string; keepCount: number } {
  const args = process.argv.slice(2)
  let backupDir = DEFAULT_BACKUP_DIR
  let dataFile = DEFAULT_DATA_FILE
  let keepCount = DEFAULT_KEEP_COUNT

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backup-dir' && args[i + 1]) {
      backupDir = args[++i]
    } else if (args[i] === '--data-file' && args[i + 1]) {
      dataFile = args[++i]
    } else if (args[i] === '--keep' && args[i + 1]) {
      keepCount = parseInt(args[++i], 10)
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
SwarmUI Database Backup Script

Usage:
  npx tsx scripts/backup.ts [options]

Options:
  --backup-dir <path>  Directory to store backups (default: ./backups)
  --data-file <path>   Path to database file (default: ./db.json)
  --keep <count>       Number of backups to keep (default: 7)
  --help, -h           Show this help message

Environment Variables:
  BACKUP_DIR           Same as --backup-dir
  DATA_FILE            Same as --data-file
  BACKUP_KEEP_COUNT    Same as --keep
`)
      process.exit(0)
    }
  }

  return { backupDir, dataFile, keepCount }
}

function calculateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function getRecordCounts(data: Record<string, unknown[]>): BackupMetadata['recordCounts'] {
  return {
    sessions: Array.isArray(data.sessions) ? data.sessions.length : 0,
    projects: Array.isArray(data.projects) ? data.projects.length : 0,
    jobs: Array.isArray(data.jobs) ? data.jobs.length : 0,
    scheduledTasks: Array.isArray(data.scheduledTasks) ? data.scheduledTasks.length : 0,
    evidence: Array.isArray(data.evidence) ? data.evidence.length : 0,
    testRuns: Array.isArray(data.testRuns) ? data.testRuns.length : 0,
    extensions: Array.isArray(data.extensions) ? data.extensions.length : 0,
    users: Array.isArray(data.users) ? data.users.length : 0,
  }
}

function cleanupOldBackups(backupDir: string, keepCount: number): number {
  if (!existsSync(backupDir)) return 0

  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .map((f) => ({
      name: f,
      path: join(backupDir, f),
      mtime: statSync(join(backupDir, f)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime)

  let deleted = 0
  for (let i = keepCount; i < files.length; i++) {
    try {
      unlinkSync(files[i].path)
      console.log(`  Deleted old backup: ${files[i].name}`)
      deleted++
    } catch (err) {
      console.error(`  Failed to delete ${files[i].name}:`, err)
    }
  }

  return deleted
}

async function backup(): Promise<void> {
  const { backupDir, dataFile, keepCount } = parseArgs()

  console.log('SwarmUI Database Backup')
  console.log('=======================')
  console.log(`Source: ${dataFile}`)
  console.log(`Destination: ${backupDir}`)
  console.log(`Keep last: ${keepCount} backups`)
  console.log('')

  if (!existsSync(dataFile)) {
    console.error(`Error: Database file not found: ${dataFile}`)
    process.exit(1)
  }

  mkdirSync(backupDir, { recursive: true })

  console.log('Reading database...')
  const rawData = readFileSync(dataFile, 'utf-8')
  const data = JSON.parse(rawData) as Record<string, unknown[]>
  const checksum = calculateChecksum(rawData)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `backup-${timestamp}.json`)

  const metadata: BackupMetadata = {
    version: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    createdAt: Date.now(),
    sourceFile: dataFile,
    checksum,
    recordCounts: getRecordCounts(data),
  }

  const backup: BackupFile = {
    version: BACKUP_VERSION,
    metadata,
    data,
  }

  console.log('Creating backup...')
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))

  const stats = statSync(backupPath)
  console.log(`\nBackup created successfully!`)
  console.log(`  File: ${backupPath}`)
  console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`)
  console.log(`  Checksum: ${checksum.substring(0, 16)}...`)
  console.log(`  Records:`)
  console.log(`    - Sessions: ${metadata.recordCounts.sessions}`)
  console.log(`    - Projects: ${metadata.recordCounts.projects}`)
  console.log(`    - Jobs: ${metadata.recordCounts.jobs}`)
  console.log(`    - Scheduled Tasks: ${metadata.recordCounts.scheduledTasks}`)
  console.log(`    - Evidence: ${metadata.recordCounts.evidence}`)
  console.log(`    - Test Runs: ${metadata.recordCounts.testRuns}`)
  console.log(`    - Extensions: ${metadata.recordCounts.extensions}`)
  console.log(`    - Users: ${metadata.recordCounts.users}`)

  console.log('\nCleaning up old backups...')
  const deleted = cleanupOldBackups(backupDir, keepCount)
  if (deleted > 0) {
    console.log(`  Removed ${deleted} old backup(s)`)
  } else {
    console.log('  No old backups to remove')
  }

  console.log('\nBackup complete!')
}

backup().catch((err) => {
  console.error('Backup failed:', err)
  process.exit(1)
})
