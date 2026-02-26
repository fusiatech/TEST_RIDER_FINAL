/**
 * Evidence ledger helpers for pipeline runs.
 * T8.1, T8.2, T8.4: Create evidence, append excerpts, diff summary.
 */

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { EvidenceLedgerEntry } from '@/lib/types'
import { createEvidence, updateEvidence } from '@/server/storage'
import { isGitRepo } from '@/server/worktree-manager'

const CLI_EXCERPT_MAX = 2048
const DIFF_SUMMARY_MAX = 1024

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
