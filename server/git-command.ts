import { spawn } from 'node:child_process'

export interface GitCommandResult {
  code: number
  stdout: string
  stderr: string
}

export async function runGitCommand(
  args: string[],
  cwd: string,
): Promise<GitCommandResult> {
  return new Promise<GitCommandResult>((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    proc.on('error', (error) => {
      reject(error)
    })

    proc.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      })
    })
  })
}
