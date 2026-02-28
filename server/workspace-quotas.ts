import fs from 'node:fs'
import path from 'node:path'
import type { WorkspaceQuotaPolicy } from '@/lib/types'
import { WorkspaceQuotaPolicySchema } from '@/lib/types'

const DEFAULT_POLICY: WorkspaceQuotaPolicy = WorkspaceQuotaPolicySchema.parse({})

const BLOCKED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  '.turbo',
  '.vercel',
])

export interface WorkspaceUsage {
  fileCount: number
  totalBytes: number
}

export function getDefaultWorkspaceQuotaPolicy(): WorkspaceQuotaPolicy {
  return DEFAULT_POLICY
}

export function resolveWorkspaceQuotaPolicy(
  policy?: Partial<WorkspaceQuotaPolicy>
): WorkspaceQuotaPolicy {
  return WorkspaceQuotaPolicySchema.parse({
    ...DEFAULT_POLICY,
    ...(policy ?? {}),
  })
}

export function getWorkspaceUsage(rootPath: string): WorkspaceUsage {
  const root = path.resolve(rootPath)
  let fileCount = 0
  let totalBytes = 0

  const walk = (current: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (BLOCKED_DIRS.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(target)
      } else if (entry.isFile()) {
        fileCount++
        try {
          totalBytes += fs.statSync(target).size
        } catch {
          // Ignore transient fs errors
        }
      }
    }
  }

  walk(root)
  return { fileCount, totalBytes }
}

export function canCreateFile(
  rootPath: string,
  expectedSizeBytes: number,
  policy?: Partial<WorkspaceQuotaPolicy>
): { ok: boolean; reason?: string; usage: WorkspaceUsage; quota: WorkspaceQuotaPolicy } {
  const quota = resolveWorkspaceQuotaPolicy(policy)
  const usage = getWorkspaceUsage(rootPath)

  if (expectedSizeBytes > quota.maxFileSizeBytes) {
    return {
      ok: false,
      reason: `File exceeds per-file limit (${expectedSizeBytes} > ${quota.maxFileSizeBytes})`,
      usage,
      quota,
    }
  }
  if (usage.fileCount + 1 > quota.maxFileCount) {
    return {
      ok: false,
      reason: `Workspace file-count quota exceeded (${usage.fileCount + 1} > ${quota.maxFileCount})`,
      usage,
      quota,
    }
  }
  if (usage.totalBytes + expectedSizeBytes > quota.maxTotalBytes) {
    return {
      ok: false,
      reason: `Workspace storage quota exceeded (${usage.totalBytes + expectedSizeBytes} > ${quota.maxTotalBytes})`,
      usage,
      quota,
    }
  }
  return { ok: true, usage, quota }
}

