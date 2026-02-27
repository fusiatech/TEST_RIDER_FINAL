import path from 'node:path'

export function getWorkspaceRoot(): string {
  return path.resolve(process.env.PROJECT_PATH ?? process.cwd())
}

function normalizeForComparison(inputPath: string): string {
  const normalized = path.normalize(inputPath)
  return process.platform === 'win32'
    ? normalized.toLowerCase()
    : normalized
}

export function resolvePathWithinWorkspace(requestedPath?: string | null): {
  ok: boolean
  path?: string
  error?: string
} {
  const workspaceRoot = getWorkspaceRoot()
  const target = requestedPath
    ? (
        path.isAbsolute(requestedPath)
          ? path.resolve(requestedPath)
          : path.resolve(workspaceRoot, requestedPath)
      )
    : workspaceRoot

  const normalizedRoot = normalizeForComparison(workspaceRoot)
  const normalizedTarget = normalizeForComparison(target)
  const relative = path.relative(normalizedRoot, normalizedTarget)
  const insideWorkspace =
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))

  if (insideWorkspace) {
    return { ok: true, path: target }
  }

  return {
    ok: false,
    error: `Path "${requestedPath}" is outside workspace root`,
  }
}

export function assertPathWithinWorkspace(requestedPath?: string | null): string {
  const resolved = resolvePathWithinWorkspace(requestedPath)
  if (!resolved.ok || !resolved.path) {
    throw new Error(resolved.error ?? 'Path outside workspace root')
  }
  return resolved.path
}
