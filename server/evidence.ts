/**
 * Evidence ledger helpers for pipeline runs.
 * T8.1, T8.2, T8.4: Create evidence, append excerpts, diff summary.
 * GAP-011: Enhanced with file snapshots, test results, screenshots.
 */

import { execSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import type { EvidenceLedgerEntry, FileSnapshot, LinkedTestResult, Screenshot, TestResult } from '@/lib/types'
import { createEvidence, updateEvidence, getEvidence } from '@/server/storage'
import { isGitRepo } from '@/server/worktree-manager'

const CLI_EXCERPT_MAX = 2048
const DIFF_SUMMARY_MAX = 1024
const FILE_SNAPSHOT_MAX = 100 * 1024

export interface GitInfo {
  branch: string
  commitHash: string
}

/**
 * Get current git branch and commit hash. Returns null if not a git repo.
 */
export function getGitBranchAndCommit(workdir: string): GitInfo | null {
  if (!isGitRepo(workdir)) return null
  try {
    const branch = execSync('git branch --show-current', {
      cwd: workdir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: workdir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return { branch, commitHash }
  } catch {
    return null
  }
}

/**
 * Get git diff --stat summary. Max 1KB. Returns empty string if not git repo or error.
 */
export function getGitDiffStat(workdir: string): string {
  if (!isGitRepo(workdir)) return ''
  try {
    const out = execSync('git diff --stat', {
      cwd: workdir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return out.slice(0, DIFF_SUMMARY_MAX)
  } catch {
    return ''
  }
}

/**
 * Truncate string to max length for CLI excerpt (2KB per agent).
 */
export function truncateCliExcerpt(output: string): string {
  if (output.length <= CLI_EXCERPT_MAX) return output
  return output.slice(0, CLI_EXCERPT_MAX) + '\n...[truncated]'
}

/**
 * Create evidence entry at pipeline start. Skips branch/commitHash if not git repo.
 */
export async function createPipelineEvidence(projectPath: string): Promise<string> {
  const id = randomUUID()
  const timestamp = Date.now()
  const git = getGitBranchAndCommit(projectPath)
  const entry: EvidenceLedgerEntry = {
    id,
    timestamp,
    branch: git?.branch,
    commitHash: git?.commitHash,
  }
  await createEvidence(entry)
  return id
}

/**
 * Append CLI excerpt for an agent to evidence. Max 2KB per agent.
 */
export async function appendCliExcerpt(
  evidenceId: string,
  agentId: string,
  output: string
): Promise<void> {
  const excerpt = truncateCliExcerpt(output)
  await updateEvidence(evidenceId, {
    cliExcerpts: { [agentId]: excerpt },
  })
}

/**
 * Append diff summary to evidence. Max 1KB.
 */
export async function appendDiffSummary(
  evidenceId: string,
  projectPath: string
): Promise<void> {
  const diffSummary = getGitDiffStat(projectPath)
  if (diffSummary) {
    await updateEvidence(evidenceId, { diffSummary })
  }
}

/**
 * Link ticket to evidence (add ticketId to evidence, evidenceId to ticket).
 */
export async function linkTicketToEvidence(
  evidenceId: string,
  ticketId: string
): Promise<void> {
  await updateEvidence(evidenceId, {
    ticketIds: [ticketId],
  })
}

/**
 * GAP-011: Capture a file snapshot with content hash.
 * Returns the snapshot object or null if file doesn't exist or is too large.
 */
export async function captureFileSnapshot(filePath: string): Promise<FileSnapshot | null> {
  try {
    if (!existsSync(filePath)) {
      return null
    }

    const content = readFileSync(filePath, 'utf-8')
    
    if (content.length > FILE_SNAPSHOT_MAX) {
      return {
        path: filePath,
        content: content.slice(0, FILE_SNAPSHOT_MAX) + '\n...[truncated]',
        hash: createHash('sha256').update(content).digest('hex'),
      }
    }

    return {
      path: filePath,
      content,
      hash: createHash('sha256').update(content).digest('hex'),
    }
  } catch {
    return null
  }
}

/**
 * GAP-011: Append file snapshot to evidence entry.
 */
export async function appendFileSnapshot(
  evidenceId: string,
  snapshot: FileSnapshot
): Promise<void> {
  const existing = await getEvidence(evidenceId)
  const snapshots = existing?.fileSnapshots ?? []
  
  const existingIdx = snapshots.findIndex(s => s.path === snapshot.path)
  if (existingIdx >= 0) {
    snapshots[existingIdx] = snapshot
  } else {
    snapshots.push(snapshot)
  }
  
  await updateEvidence(evidenceId, {
    fileSnapshots: snapshots,
  })
}

/**
 * GAP-011: Link a test result to evidence entry.
 */
export async function linkTestResult(
  evidenceId: string,
  testResult: TestResult
): Promise<void> {
  const existing = await getEvidence(evidenceId)
  const results: LinkedTestResult[] = existing?.testResults ?? []
  
  const linkedResult: LinkedTestResult = {
    testId: testResult.id,
    passed: testResult.status === 'passed',
    output: testResult.error || testResult.stackTrace || `Test ${testResult.status} in ${testResult.duration}ms`,
  }
  
  const existingIdx = results.findIndex(r => r.testId === testResult.id)
  if (existingIdx >= 0) {
    results[existingIdx] = linkedResult
  } else {
    results.push(linkedResult)
  }
  
  await updateEvidence(evidenceId, {
    testResults: results,
  })
}

/**
 * GAP-011: Link multiple test results to evidence entry.
 */
export async function linkTestResults(
  evidenceId: string,
  testResults: TestResult[]
): Promise<void> {
  for (const result of testResults) {
    await linkTestResult(evidenceId, result)
  }
}

/**
 * GAP-011: Append a screenshot reference to evidence entry.
 */
export async function appendScreenshot(
  evidenceId: string,
  screenshot: Screenshot
): Promise<void> {
  const existing = await getEvidence(evidenceId)
  const screenshots = existing?.screenshots ?? []
  screenshots.push(screenshot)
  
  await updateEvidence(evidenceId, {
    screenshots,
  })
}

/**
 * GAP-011: Capture multiple file snapshots and append to evidence.
 */
export async function captureAndAppendFileSnapshots(
  evidenceId: string,
  filePaths: string[]
): Promise<number> {
  let captured = 0
  
  for (const filePath of filePaths) {
    const snapshot = await captureFileSnapshot(filePath)
    if (snapshot) {
      await appendFileSnapshot(evidenceId, snapshot)
      captured++
    }
  }
  
  return captured
}
