import { execSync } from 'node:child_process'

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

function run(command: string, cwd?: string): string {
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
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

function shellEscape(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`
}
