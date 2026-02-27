import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { getWorkspaceRoot, resolvePathWithinWorkspace } from '@/server/workspace-path'

describe('workspace-path', () => {
  const originalProjectPath = process.env.PROJECT_PATH

  beforeEach(() => {
    process.env.PROJECT_PATH = '/repo/workspace'
  })

  afterEach(() => {
    if (originalProjectPath === undefined) {
      delete process.env.PROJECT_PATH
      return
    }
    process.env.PROJECT_PATH = originalProjectPath
  })

  it('uses PROJECT_PATH as workspace root', () => {
    expect(getWorkspaceRoot()).toBe(path.resolve('/repo/workspace'))
  })

  it('resolves relative paths inside workspace root', () => {
    const resolved = resolvePathWithinWorkspace('src/index.ts')
    expect(resolved.ok).toBe(true)
    expect(resolved.path).toBe(path.resolve('/repo/workspace', 'src/index.ts'))
  })

  it('rejects traversal outside workspace root', () => {
    const resolved = resolvePathWithinWorkspace('../outside')
    expect(resolved.ok).toBe(false)
    expect(resolved.error).toContain('outside workspace root')
  })
})
