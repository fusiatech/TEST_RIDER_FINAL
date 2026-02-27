#!/usr/bin/env npx tsx
/**
 * SwarmUI Database Restore Script
 * 
 * Restores the database from a backup file with validation.
 * Creates a pre-restore backup before overwriting existing data.
 * 
 * Usage:
 *   npx tsx scripts/restore.ts <backup-file>
 *   npx tsx scripts/restore.ts backups/backup-2026-02-27T10-30-00-000Z.json
 *   npx tsx scripts/restore.ts --list
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync } from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'

const SUPPORTED_VERSIONS = ['1.0']
const DEFAULT_BACKUP_DIR = process.env.BACKUP_DIR || './backups'
const DEFAULT_DATA_FILE = process.env.DATA_FILE || './db.json'

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

function parseArgs(): { backupFile: string | null; listBackups: boolean; dataFile: string; force: boolean } {
  const args = process.argv.slice(2)
  let backupFile: string | null = null
  let listBackups = false
  let dataFile = DEFAULT_DATA_FILE
  let force = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--list' || args[i] === '-l') {
      listBackups = true
    } else if (args[i] === '--data-file' && args[i + 1]) {
      dataFile = args[++i]
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
SwarmUI Database Restore Script

Usage:
  npx tsx scripts/restore.ts <backup-file> [options]
  npx tsx scripts/restore.ts --list

Arguments:
  <backup-file>        Path to the backup file to restore

Options:
  --list, -l           List available backups
  --data-file <path>   Path to database file (default: ./db.json)
  --force, -f          Skip confirmation prompt
  --help, -h           Show this help message

Environment Variables:
  BACKUP_DIR           Directory containing backups (for --list)
  DATA_FILE            Same as --data-file

Examples:
  npx tsx scripts/restore.ts backups/backup-2026-02-27T10-30-00-000Z.json
  npx tsx scripts/restore.ts --list
  npx tsx scripts/restore.ts backups/latest.json --force
`)
      process.exit(0)
    } else if (!args[i].startsWith('-')) {
      backupFile = args[i]
    }
  }

  return { backupFile, listBackups, dataFile, force }
}

function calculateChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function listAvailableBackups(): void {
  const backupDir = DEFAULT_BACKUP_DIR

  if (!existsSync(backupDir)) {
    console.log('No backup directory found.')
    return
  }

  const files = readdirSync(backupDir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .map((f) => {
      const path = join(backupDir, f)
      const stats = statSync(path)
      let metadata: BackupMetadata | null = null
      
      try {
        const content = JSON.parse(readFileSync(path, 'utf-8')) as BackupFile
        metadata = content.metadata
      } catch {
        // Ignore parse errors
      }

      return {
        name: f,
        path,
        size: stats.size,
        mtime: stats.mtime,
        metadata,
      }
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  if (files.length === 0) {
    console.log('No backups found in', backupDir)
    return
  }

  console.log('Available Backups')
  console.log('=================')
  console.log(`Directory: ${backupDir}\n`)

  for (const file of files) {
    console.log(`${file.name}`)
    console.log(`  Size: ${(file.size / 1024).toFixed(2)} KB`)
    console.log(`  Modified: ${file.mtime.toISOString()}`)
    if (file.metadata) {
      console.log(`  Version: ${file.metadata.version}`)
      console.log(`  Records: ${Object.values(file.metadata.recordCounts).reduce((a, b) => a + b, 0)} total`)
    }
    console.log('')
  }

  console.log(`Total: ${files.length} backup(s)`)
}

function validateBackup(backup: unknown): backup is BackupFile {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup file: not an object')
  }

  const b = backup as Record<string, unknown>

  if (!b.version || typeof b.version !== 'string') {
    throw new Error('Invalid backup file: missing version')
  }

  if (!SUPPORTED_VERSIONS.includes(b.version)) {
    throw new Error(`Unsupported backup version: ${b.version}. Supported: ${SUPPORTED_VERSIONS.join(', ')}`)
  }

  if (!b.metadata || typeof b.metadata !== 'object') {
    throw new Error('Invalid backup file: missing metadata')
  }

  if (!b.data || typeof b.data !== 'object') {
    throw new Error('Invalid backup file: missing data')
  }

  return true
}

function validateDataStructure(data: unknown): void {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data structure: not an object')
  }

  const d = data as Record<string, unknown>
  const requiredArrays = ['sessions', 'projects', 'jobs']
  
  for (const key of requiredArrays) {
    if (d[key] !== undefined && !Array.isArray(d[key])) {
      throw new Error(`Invalid data structure: ${key} must be an array`)
    }
  }
}

async function restore(): Promise<void> {
  const { backupFile, listBackups, dataFile, force } = parseArgs()

  if (listBackups) {
    listAvailableBackups()
    return
  }

  if (!backupFile) {
    console.error('Error: No backup file specified')
    console.error('Usage: npx tsx scripts/restore.ts <backup-file>')
    console.error('       npx tsx scripts/restore.ts --list')
    process.exit(1)
  }

  console.log('SwarmUI Database Restore')
  console.log('========================')
  console.log(`Backup file: ${backupFile}`)
  console.log(`Target: ${dataFile}`)
  console.log('')

  if (!existsSync(backupFile)) {
    console.error(`Error: Backup file not found: ${backupFile}`)
    process.exit(1)
  }

  console.log('Reading backup file...')
  const rawBackup = readFileSync(backupFile, 'utf-8')
  let backup: BackupFile

  try {
    backup = JSON.parse(rawBackup) as BackupFile
  } catch (err) {
    console.error('Error: Failed to parse backup file as JSON')
    process.exit(1)
  }

  console.log('Validating backup...')
  try {
    validateBackup(backup)
    validateDataStructure(backup.data)
  } catch (err) {
    console.error('Validation failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  console.log(`\nBackup Information:`)
  console.log(`  Version: ${backup.metadata.version}`)
  console.log(`  Created: ${backup.metadata.timestamp}`)
  console.log(`  Original checksum: ${backup.metadata.checksum.substring(0, 16)}...`)
  console.log(`  Records:`)
  console.log(`    - Sessions: ${backup.metadata.recordCounts.sessions}`)
  console.log(`    - Projects: ${backup.metadata.recordCounts.projects}`)
  console.log(`    - Jobs: ${backup.metadata.recordCounts.jobs}`)
  console.log(`    - Scheduled Tasks: ${backup.metadata.recordCounts.scheduledTasks}`)
  console.log(`    - Evidence: ${backup.metadata.recordCounts.evidence}`)
  console.log(`    - Test Runs: ${backup.metadata.recordCounts.testRuns}`)
  console.log(`    - Extensions: ${backup.metadata.recordCounts.extensions}`)
  console.log(`    - Users: ${backup.metadata.recordCounts.users}`)

  if (!force) {
    console.log('\n⚠️  WARNING: This will overwrite the current database!')
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...')
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

  if (existsSync(dataFile)) {
    const preRestoreBackup = `${dataFile}.pre-restore.${Date.now()}.bak`
    console.log(`\nCreating pre-restore backup: ${preRestoreBackup}`)
    copyFileSync(dataFile, preRestoreBackup)
  }

  console.log('Restoring database...')
  const dataJson = JSON.stringify(backup.data, null, 2)
  writeFileSync(dataFile, dataJson)

  const newChecksum = calculateChecksum(dataJson)
  console.log(`\nRestore completed successfully!`)
  console.log(`  Target: ${dataFile}`)
  console.log(`  New checksum: ${newChecksum.substring(0, 16)}...`)

  console.log('\n✅ Database restored from backup!')
  console.log('   Restart the application to load the restored data.')
}

restore().catch((err) => {
  console.error('Restore failed:', err)
  process.exit(1)
})
