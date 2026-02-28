import { execSync } from 'node:child_process'
import { executeWithCircuitBreakerSync } from '@/server/circuit-breaker'

export interface GitHubConfig {
  enabled: boolean
  autoCreatePR: boolean
  baseBranch: string
  branchPrefix: string
}

export const DEFAULT_GITHUB_CONFIG: GitHubConfig = {
  enabled: false,
  autoCreatePR: false,
  baseBranch: 'main',
  branchPrefix: 'swarm/',
}

export interface GitHubIssue {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  url: string
  createdAt: string
  updatedAt: string
}

export interface GitHubPR {
  number: number
  title: string
  body: string
  state: 'open' | 'closed' | 'merged'
  url: string
  headBranch: string
  baseBranch: string
  createdAt: string
  updatedAt: string
}

export interface GitHubWorkflowRun {
  id: number
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
  url: string
  createdAt: string
  updatedAt: string
}

export interface GitHubReviewComment {
  id: number
  body: string
  path: string
  line: number
  url: string
  createdAt: string
}

function run(command: string, cwd?: string): string {
  return executeWithCircuitBreakerSync('github', `gh:${command}`, () =>
    execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  )
}

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}

export async function isGitHubAuthenticated(): Promise<boolean> {
  try {
    run('gh auth status')
    return true
  } catch {
    return false
  }
}

export async function createBranch(name: string, baseBranch: string): Promise<void> {
  run(`git checkout -b ${shellEscape(name)} ${shellEscape(baseBranch)}`)
}

export async function commitChanges(message: string, files: string[]): Promise<void> {
  const escapedFiles = files.map(shellEscape).join(' ')
  run(`git add ${escapedFiles}`)
  run(`git commit -m ${shellEscape(message)}`)
}

export async function createPullRequest(title: string, body: string, base: string): Promise<string> {
  const output = run(
    `gh pr create --title ${shellEscape(title)} --body ${shellEscape(body)} --base ${shellEscape(base)}`
  )
  return output
}

export async function getRepoInfo(): Promise<{ owner: string; repo: string; branch: string }> {
  const repoJson = run('gh repo view --json owner,name')
  const parsed: { owner: { login: string }; name: string } = JSON.parse(repoJson)
  const branch = run('git branch --show-current')
  return {
    owner: parsed.owner.login,
    repo: parsed.name,
    branch,
  }
}

/* ── GAP-053: Enhanced GitHub Integration ──────────────────────── */

/**
 * Create a new GitHub issue.
 */
export async function createIssue(
  title: string,
  body: string,
  labels?: string[]
): Promise<GitHubIssue> {
  let cmd = `gh issue create --title ${shellEscape(title)} --body ${shellEscape(body)}`
  
  if (labels && labels.length > 0) {
    cmd += ` --label ${labels.map(shellEscape).join(',')}`
  }
  
  cmd += ' --json number,title,body,state,labels,url,createdAt,updatedAt'
  
  const output = run(cmd)
  const parsed = JSON.parse(output)
  
  return {
    number: parsed.number,
    title: parsed.title,
    body: parsed.body,
    state: parsed.state,
    labels: parsed.labels?.map((l: { name: string }) => l.name) ?? [],
    url: parsed.url,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

/**
 * Get an issue by number.
 */
export async function getIssue(issueNumber: number): Promise<GitHubIssue> {
  const output = run(
    `gh issue view ${issueNumber} --json number,title,body,state,labels,url,createdAt,updatedAt`
  )
  const parsed = JSON.parse(output)
  
  return {
    number: parsed.number,
    title: parsed.title,
    body: parsed.body,
    state: parsed.state,
    labels: parsed.labels?.map((l: { name: string }) => l.name) ?? [],
    url: parsed.url,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

/**
 * List issues with optional filters.
 */
export async function listIssues(options?: {
  state?: 'open' | 'closed' | 'all'
  labels?: string[]
  limit?: number
}): Promise<GitHubIssue[]> {
  let cmd = 'gh issue list --json number,title,body,state,labels,url,createdAt,updatedAt'
  
  if (options?.state) {
    cmd += ` --state ${options.state}`
  }
  if (options?.labels && options.labels.length > 0) {
    cmd += ` --label ${options.labels.join(',')}`
  }
  if (options?.limit) {
    cmd += ` --limit ${options.limit}`
  }
  
  const output = run(cmd)
  const parsed: Array<{
    number: number
    title: string
    body: string
    state: 'open' | 'closed'
    labels: Array<{ name: string }>
    url: string
    createdAt: string
    updatedAt: string
  }> = JSON.parse(output)
  
  return parsed.map((issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels?.map((l) => l.name) ?? [],
    url: issue.url,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }))
}

/**
 * Close an issue.
 */
export async function closeIssue(issueNumber: number, comment?: string): Promise<void> {
  if (comment) {
    run(`gh issue close ${issueNumber} --comment ${shellEscape(comment)}`)
  } else {
    run(`gh issue close ${issueNumber}`)
  }
}

/**
 * Add a review comment to a pull request.
 */
export async function addReviewComment(
  prNumber: number,
  body: string,
  path: string,
  line: number
): Promise<GitHubReviewComment> {
  const { owner, repo } = await getRepoInfo()
  
  const output = run(
    `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments ` +
    `-f body=${shellEscape(body)} ` +
    `-f path=${shellEscape(path)} ` +
    `-f line=${line} ` +
    `-f side=RIGHT`
  )
  
  const parsed = JSON.parse(output)
  
  return {
    id: parsed.id,
    body: parsed.body,
    path: parsed.path,
    line: parsed.line ?? parsed.original_line ?? line,
    url: parsed.html_url,
    createdAt: parsed.created_at,
  }
}

/**
 * Add a general comment to a PR (not line-specific).
 */
export async function addPRComment(prNumber: number, body: string): Promise<void> {
  run(`gh pr comment ${prNumber} --body ${shellEscape(body)}`)
}

/**
 * Get workflow runs.
 */
export async function getWorkflowRuns(options?: {
  workflow?: string
  status?: 'queued' | 'in_progress' | 'completed'
  limit?: number
}): Promise<GitHubWorkflowRun[]> {
  let cmd = 'gh run list --json databaseId,name,status,conclusion,url,createdAt,updatedAt'
  
  if (options?.workflow) {
    cmd += ` --workflow ${shellEscape(options.workflow)}`
  }
  if (options?.status) {
    cmd += ` --status ${options.status}`
  }
  if (options?.limit) {
    cmd += ` --limit ${options.limit}`
  }
  
  const output = run(cmd)
  const parsed: Array<{
    databaseId: number
    name: string
    status: 'queued' | 'in_progress' | 'completed'
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null
    url: string
    createdAt: string
    updatedAt: string
  }> = JSON.parse(output)
  
  return parsed.map((run) => ({
    id: run.databaseId,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    url: run.url,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }))
}

/**
 * Trigger a workflow dispatch event.
 */
export async function triggerWorkflow(
  workflowId: string,
  ref?: string,
  inputs?: Record<string, string>
): Promise<void> {
  let cmd = `gh workflow run ${shellEscape(workflowId)}`
  
  if (ref) {
    cmd += ` --ref ${shellEscape(ref)}`
  }
  
  if (inputs) {
    for (const [key, value] of Object.entries(inputs)) {
      cmd += ` -f ${shellEscape(key)}=${shellEscape(value)}`
    }
  }
  
  run(cmd)
}

/**
 * Get a specific workflow run.
 */
export async function getWorkflowRun(runId: number): Promise<GitHubWorkflowRun> {
  const output = run(
    `gh run view ${runId} --json databaseId,name,status,conclusion,url,createdAt,updatedAt`
  )
  const parsed = JSON.parse(output)
  
  return {
    id: parsed.databaseId,
    name: parsed.name,
    status: parsed.status,
    conclusion: parsed.conclusion,
    url: parsed.url,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

/**
 * Re-run a failed workflow.
 */
export async function rerunWorkflow(runId: number, failedOnly?: boolean): Promise<void> {
  let cmd = `gh run rerun ${runId}`
  if (failedOnly) {
    cmd += ' --failed'
  }
  run(cmd)
}

/**
 * Cancel a workflow run.
 */
export async function cancelWorkflowRun(runId: number): Promise<void> {
  run(`gh run cancel ${runId}`)
}

/**
 * Get PR details.
 */
export async function getPullRequest(prNumber: number): Promise<GitHubPR> {
  const output = run(
    `gh pr view ${prNumber} --json number,title,body,state,url,headRefName,baseRefName,createdAt,updatedAt`
  )
  const parsed = JSON.parse(output)
  
  return {
    number: parsed.number,
    title: parsed.title,
    body: parsed.body,
    state: parsed.state,
    url: parsed.url,
    headBranch: parsed.headRefName,
    baseBranch: parsed.baseRefName,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

/**
 * Merge a pull request.
 */
export async function mergePullRequest(
  prNumber: number,
  method?: 'merge' | 'squash' | 'rebase'
): Promise<void> {
  let cmd = `gh pr merge ${prNumber} --auto`
  if (method) {
    cmd += ` --${method}`
  }
  run(cmd)
}

/**
 * Request reviewers for a PR.
 */
export async function requestReviewers(
  prNumber: number,
  reviewers: string[]
): Promise<void> {
  run(`gh pr edit ${prNumber} --add-reviewer ${reviewers.join(',')}`)
}
