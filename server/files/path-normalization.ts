import path from 'node:path'
import { isPathSafe, sanitizeFilename } from '@/lib/sanitize'

export function toApiRelativePath(projectRoot: string, targetPath: string): string {
  const relative = path.relative(projectRoot, targetPath)
  return relative.split(path.sep).join('/').replace(/\\/g, '/')
}

export function decodeAndSplitPathSegments(rawSegments: string[]): string[] {
  return rawSegments
    .flatMap((segment) => {
      const decoded = decodeURIComponent(segment)
      return decoded.split(/[\\/]+/g)
    })
    .filter(Boolean)
}

export function sanitizeApiPathSegments(rawSegments: string[]): string[] {
  const expanded = decodeAndSplitPathSegments(rawSegments)
  return expanded
    .map((segment) => sanitizeFilename(segment))
    .filter((segment) => segment.length > 0)
}

export function areRawPathSegmentsSafe(rawSegments: string[]): boolean {
  return decodeAndSplitPathSegments(rawSegments).every((segment) => isPathSafe(segment))
}
