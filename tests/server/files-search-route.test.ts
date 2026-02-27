import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/files/search/route'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { promises as fs } from 'fs'

vi.mock('@/server/workspace-path', () => ({
  resolvePathWithinWorkspace: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}))

const mockResolvePathWithinWorkspace = vi.mocked(resolvePathWithinWorkspace)
const mockStat = vi.mocked(fs.stat)
const mockReaddir = vi.mocked(fs.readdir)

describe('GET /api/files/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects paths outside workspace root', async () => {
    mockResolvePathWithinWorkspace.mockReturnValue({
      ok: false,
      error: 'Path "../outside" is outside workspace root',
    })

    const response = await GET(
      new Request('http://localhost/api/files/search?q=todo&path=../outside') as never,
    )

    expect(response.status).toBe(403)
    const payload = await response.json()
    expect(payload.error).toContain('outside workspace root')
  })

  it('returns empty results when search path is valid and directory is empty', async () => {
    mockResolvePathWithinWorkspace.mockReturnValue({
      ok: true,
      path: '/repo/workspace',
    })
    mockStat.mockResolvedValue({
      isDirectory: () => true,
    } as never)
    mockReaddir.mockResolvedValue([])

    const response = await GET(
      new Request('http://localhost/api/files/search?q=todo&path=src') as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.results).toEqual([])
  })
})
