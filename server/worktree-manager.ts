import { execSync } from 'child_process'
import { join } from 'path'

/**
 * Check whether the given path is inside a Git repository.
 *
 * @param path - The filesystem path to check.
 * @returns true if `git rev-parse` succeeds in that directory.
 */
export function isGitRepo(path: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: path,
      stdio: 'pipe'
    })
    return true
  } catch {
    return false
  }
}

/**
 * Create a Git worktree for an agent.
 *
 * Runs `git worktree add ./worktrees/{name} -b swarm/{name}` inside `basePath`.
 * If the branch already exists (e.g. from a previous failed run) the existing
 * worktree/branch is cleaned up first and retried.
 *
 * @param basePath - Root of the Git repository.
 * @param name     - Unique name for this worktree (typically the agent id).
 * @returns The absolute path to the newly created worktree.
 */
export function createWorktree(basePath: string, name: string): string {
  const worktreePath = join(basePath, 'worktrees', name)
  const branchName = `swarm/${name}`

  try {
    execSync(
      `git worktree add "${worktreePath}" -b "${branchName}"`,
      { cwd: basePath, stdio: 'pipe' }
    )
    return worktreePath
  } catch (firstErr: unknown) {
    // The branch or worktree may already exist from a stale run — clean up and retry.
    try {
      cleanupWorktree(basePath, name)
      execSync(
        `git worktree add "${worktreePath}" -b "${branchName}"`,
        { cwd: basePath, stdio: 'pipe' }
      )
      return worktreePath
    } catch (retryErr: unknown) {
      const message = retryErr instanceof Error ? retryErr.message : String(retryErr)
      console.warn(
        `[worktree-manager] Failed to create worktree "${name}": ${message}`
      )
      return worktreePath
    }
  }
}

/**
 * Remove a single worktree and its associated branch.
 *
 * @param basePath - Root of the Git repository.
 * @param name     - Name used when the worktree was created.
 */
export function cleanupWorktree(basePath: string, name: string): void {
  const worktreePath = join(basePath, 'worktrees', name)
  const branchName = `swarm/${name}`

  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: basePath,
      stdio: 'pipe'
    })
  } catch {
    // Worktree may not exist — that's fine
  }

  try {
    execSync(`git branch -D "${branchName}"`, {
      cwd: basePath,
      stdio: 'pipe'
    })
  } catch {
    // Branch may not exist — that's fine
  }
}

/**
 * Remove **all** swarm worktrees from the repository.
 *
 * Lists every worktree, filters to those whose branch starts with `swarm/`,
 * and removes each one along with its branch.
 *
 * @param basePath - Root of the Git repository.
 */
export function cleanupAllWorktrees(basePath: string): void {
  try {
    const raw = execSync('git worktree list --porcelain', {
      cwd: basePath,
      stdio: 'pipe',
      encoding: 'utf-8'
    })

    const worktreeNames: string[] = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('branch refs/heads/swarm/')) {
        const name = trimmed.replace('branch refs/heads/swarm/', '')
        worktreeNames.push(name)
      }
    }

    for (const name of worktreeNames) {
      cleanupWorktree(basePath, name)
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `[worktree-manager] Failed to clean up all worktrees: ${message}`
    )
  }
}
