import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const execMock = vi.hoisted(() => vi.fn())

vi.mock('child_process', () => ({
  exec: execMock,
}))

import { runSecurityChecks } from '@/server/security-checks'

describe('runSecurityChecks', () => {
  let tempDir: string

  beforeEach(() => {
    execMock.mockReset()
    tempDir = mkdtempSync(path.join(tmpdir(), 'security-checks-'))
    writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('fails npm audit when command execution fails', async () => {
    const commandError = Object.assign(new Error('npm not found'), {
      code: 1,
      stdout: '',
      stderr: 'npm: command not found',
    })

    execMock.mockImplementation((_command: string, _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(commandError, '', 'npm: command not found')
      return undefined
    })

    const result = await runSecurityChecks(tempDir, {
      typescript: false,
      eslint: false,
      secretDetection: false,
      sastChecks: false,
      npmAudit: true,
    })

    const npmAuditCheck = result.checks.find((check) => check.name === 'npm audit')
    expect(npmAuditCheck).toBeDefined()
    expect(npmAuditCheck?.passed).toBe(false)
    expect(result.passed).toBe(false)
  })

  it('fails npm audit when output is not valid JSON', async () => {
    execMock.mockImplementation((_command: string, _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, 'not-json', '')
      return undefined
    })

    const result = await runSecurityChecks(tempDir, {
      typescript: false,
      eslint: false,
      secretDetection: false,
      sastChecks: false,
      npmAudit: true,
    })

    const npmAuditCheck = result.checks.find((check) => check.name === 'npm audit')
    expect(npmAuditCheck).toBeDefined()
    expect(npmAuditCheck?.passed).toBe(false)
    expect(npmAuditCheck?.output).toContain('Failed to parse npm audit output')
    expect(result.passed).toBe(false)
  })
})
