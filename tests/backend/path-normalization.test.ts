import { describe, it, expect } from 'vitest'
import { areRawPathSegmentsSafe, decodeAndSplitPathSegments, sanitizeApiPathSegments, toApiRelativePath } from '@/server/files/path-normalization'

describe('path-normalization', () => {
  it('converts relative paths to API-safe POSIX format', () => {
    const root = 'C:/repo'
    const target = 'C:/repo/components/code-block.tsx'
    expect(toApiRelativePath(root, target)).toBe('components/code-block.tsx')
  })

  it('splits encoded backslash segments', () => {
    const segments = decodeAndSplitPathSegments(['components%5Ccode-block.tsx'])
    expect(segments).toEqual(['components', 'code-block.tsx'])
  })

  it('sanitizes unsafe segments while keeping valid names', () => {
    const segments = sanitizeApiPathSegments(['components%5C..%5Ccode-block.tsx'])
    expect(segments).toEqual(['components', 'code-block.tsx'])
  })

  it('rejects path traversal patterns', () => {
    expect(areRawPathSegmentsSafe(['..', 'secrets.txt'])).toBe(false)
  })
})
