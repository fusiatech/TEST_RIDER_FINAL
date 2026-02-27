import { runGitCommand, type GitCommandResult } from './git-command'

export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied'
  staged: boolean
  oldPath?: string
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
  isRepo: boolean
}

export interface CommitResult {
  ok: boolean
  message: string
  commitHash: string | null
  output: string
}

export interface PushPullResult {
  ok: boolean
  output: string
}

function parseStatusCode(code: string): GitFileStatus['status'] {
  switch (code) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case '?': return 'untracked'
    default: return 'modified'
  }
}

export async function getStatus(cwd: string): Promise<GitStatus> {
  const isGitRepoResult = await runGitCommand(
    ['rev-parse', '--is-inside-work-tree'],
    cwd,
  )
  
  if (isGitRepoResult.code !== 0 || isGitRepoResult.stdout.trim() !== 'true') {
    return {
      branch: '',
      ahead: 0,
      behind: 0,
      files: [],
      isRepo: false,
    }
  }

  const [branchResult, statusResult, aheadBehindResult] = await Promise.all([
    runGitCommand(['branch', '--show-current'], cwd),
    runGitCommand(['status', '--porcelain=v1'], cwd),
    runGitCommand(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], cwd),
  ])

  const branch = branchResult.code === 0
    ? (branchResult.stdout.trim() || 'HEAD')
    : 'HEAD'

  let behind = 0
  let ahead = 0
  if (aheadBehindResult.code === 0) {
    const [behindRaw, aheadRaw] = aheadBehindResult.stdout.trim().split('\t')
    behind = Number(behindRaw) || 0
    ahead = Number(aheadRaw) || 0
  }

  const files: GitFileStatus[] = []
  const lines = statusResult.stdout.split('\n').filter(Boolean)

  for (const line of lines) {
    const indexStatus = line[0]
    const workTreeStatus = line[1]
    const filePath = line.slice(3).trim()

    if (filePath.includes(' -> ')) {
      const [oldPath, newPath] = filePath.split(' -> ')
      if (indexStatus !== ' ' && indexStatus !== '?') {
        files.push({
          path: newPath,
          status: parseStatusCode(indexStatus),
          staged: true,
          oldPath,
        })
      }
      continue
    }

    if (indexStatus !== ' ' && indexStatus !== '?') {
      files.push({
        path: filePath,
        status: parseStatusCode(indexStatus),
        staged: true,
      })
    }
    if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
      const existingStaged = files.find((f) => f.path === filePath && f.staged)
      if (!existingStaged || workTreeStatus !== indexStatus) {
        files.push({
          path: filePath,
          status: parseStatusCode(workTreeStatus),
          staged: false,
        })
      }
    }
    if (indexStatus === '?' && workTreeStatus === '?') {
      files.push({
        path: filePath,
        status: 'untracked',
        staged: false,
      })
    }
  }

  return {
    branch,
    ahead,
    behind,
    files,
    isRepo: true,
  }
}

export async function stageFile(cwd: string, path: string): Promise<GitCommandResult> {
  return runGitCommand(['add', '--', path], cwd)
}

export async function stageFiles(cwd: string, paths: string[]): Promise<GitCommandResult> {
  if (paths.length === 0) {
    return { code: 1, stdout: '', stderr: 'No files specified' }
  }
  return runGitCommand(['add', '--', ...paths], cwd)
}

export async function stageAll(cwd: string): Promise<GitCommandResult> {
  return runGitCommand(['add', '-A'], cwd)
}

export async function unstageFile(cwd: string, path: string): Promise<GitCommandResult> {
  return runGitCommand(['reset', 'HEAD', '--', path], cwd)
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<GitCommandResult> {
  if (paths.length === 0) {
    return { code: 1, stdout: '', stderr: 'No files specified' }
  }
  return runGitCommand(['reset', 'HEAD', '--', ...paths], cwd)
}

export async function unstageAll(cwd: string): Promise<GitCommandResult> {
  return runGitCommand(['reset', 'HEAD'], cwd)
}

export async function commit(cwd: string, message: string): Promise<CommitResult> {
  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    return {
      ok: false,
      message: '',
      commitHash: null,
      output: 'Commit message is required',
    }
  }

  const result = await runGitCommand(['commit', '-m', trimmedMessage], cwd)
  
  if (result.code !== 0) {
    const errorText = `${result.stdout}\n${result.stderr}`
    return {
      ok: false,
      message: trimmedMessage,
      commitHash: null,
      output: errorText.includes('nothing to commit')
        ? 'Nothing to commit'
        : result.stderr || 'Failed to commit',
    }
  }

  const commitMatch = result.stdout.match(/\[[\w/-]+\s+([a-f0-9]+)\]/i)
  const commitHash = commitMatch ? commitMatch[1] : null

  return {
    ok: true,
    message: trimmedMessage,
    commitHash,
    output: result.stdout,
  }
}

export async function push(
  cwd: string,
  options?: { setUpstream?: boolean; branch?: string }
): Promise<PushPullResult> {
  const args = options?.setUpstream && options?.branch
    ? ['push', '-u', 'origin', options.branch]
    : ['push']

  const result = await runGitCommand(args, cwd)
  
  return {
    ok: result.code === 0,
    output: result.code === 0
      ? result.stdout || result.stderr
      : result.stderr || 'Failed to push',
  }
}

export async function pull(
  cwd: string,
  options?: { rebase?: boolean }
): Promise<PushPullResult> {
  const args = options?.rebase ? ['pull', '--rebase'] : ['pull']
  const result = await runGitCommand(args, cwd)
  
  return {
    ok: result.code === 0,
    output: result.code === 0
      ? result.stdout || result.stderr
      : result.stderr || 'Failed to pull',
  }
}

export async function getDiff(
  cwd: string,
  filePath: string,
  staged: boolean
): Promise<string> {
  const args = staged
    ? ['diff', '--cached', '--', filePath]
    : ['diff', '--', filePath]
  
  const result = await runGitCommand(args, cwd)
  return result.stdout || 'No changes'
}

export async function discardChanges(
  cwd: string,
  paths: string[]
): Promise<GitCommandResult> {
  if (paths.length === 0) {
    return { code: 1, stdout: '', stderr: 'No files specified' }
  }
  return runGitCommand(['checkout', '--', ...paths], cwd)
}
