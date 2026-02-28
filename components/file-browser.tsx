'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileTree, type FileNode } from '@/components/file-tree'
import { useSwarmStore } from '@/lib/store'
import { Loader2, Eye, EyeOff } from 'lucide-react'

interface FileBrowserProps {
  rootPath?: string
  onFileSelect?: (filePath: string, content: string) => void
  navigateToPath?: string | null
  onNavigateComplete?: () => void
}

export function FileBrowser({ rootPath, onFileSelect, navigateToPath, onNavigateComplete }: FileBrowserProps) {
  const [rootFiles, setRootFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expandPaths, setExpandPaths] = useState<string[]>([])
  const activeFilePath = useSwarmStore((s) => s.activeFilePath)
  const openFileInIde = useSwarmStore((s) => s.openFileInIde)
  const setFilesLoading = useSwarmStore((s) => s.setFilesLoading)
  const fileTreeVersion = useSwarmStore((s) => s.fileTreeVersion)
  const watchProject = useSwarmStore((s) => s.watchProject)
  const unwatchProject = useSwarmStore((s) => s.unwatchProject)
  const watchedProjectPath = useSwarmStore((s) => s.watchedProjectPath)
  const initWebSocket = useSwarmStore((s) => s.initWebSocket)
  const isWatching = watchedProjectPath === rootPath && rootPath !== undefined
  const hasInitializedWatch = useRef(false)

  useEffect(() => {
    if (navigateToPath && rootPath) {
      const relativePath = navigateToPath.startsWith(rootPath)
        ? navigateToPath.slice(rootPath.length).replace(/^[/\\]/, '')
        : navigateToPath
      
      if (relativePath) {
        const pathParts = relativePath.split(/[/\\]/)
        const pathsToExpand: string[] = []
        let currentPath = rootPath
        
        for (const part of pathParts) {
          currentPath = currentPath + '/' + part
          pathsToExpand.push(currentPath.replace(/\\/g, '/'))
        }
        
        setExpandPaths(pathsToExpand)
      }
      
      onNavigateComplete?.()
    }
  }, [navigateToPath, rootPath, onNavigateComplete])

  const loadDirectory = useCallback(async (dirPath?: string) => {
    const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''
    const res = await fetch(`/api/files${query}`)
    if (!res.ok) return []
    const entries: FileNode[] = await res.json()
    return entries
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDirectory(rootPath)
      .then((entries) => {
        if (!cancelled) setRootFiles(entries)
      })
      .catch(() => {
        if (!cancelled) setRootFiles([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [rootPath, loadDirectory, fileTreeVersion])

  useEffect(() => {
    if (rootPath && !hasInitializedWatch.current) {
      hasInitializedWatch.current = true
      initWebSocket()
      watchProject(rootPath)
    }
    return () => {
      if (hasInitializedWatch.current) {
        unwatchProject()
        hasInitializedWatch.current = false
      }
    }
  }, [rootPath, initWebSocket, watchProject, unwatchProject])

  const toggleWatching = useCallback(() => {
    if (!rootPath) return
    if (isWatching) {
      unwatchProject()
    } else {
      watchProject(rootPath)
    }
  }, [rootPath, isWatching, watchProject, unwatchProject])

  const handleFileSelect = useCallback(
    async (filePath: string) => {
      setFilesLoading(true)
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(filePath)}`)
        if (!res.ok) return
        const content = await res.text()
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        const langMap: Record<string, string> = {
          ts: 'typescript',
          tsx: 'typescriptreact',
          js: 'javascript',
          jsx: 'javascriptreact',
          json: 'json',
          css: 'css',
          html: 'html',
          md: 'markdown',
          py: 'python',
          rs: 'rust',
          go: 'go',
          sh: 'shell',
          yaml: 'yaml',
          yml: 'yaml',
        }
        const language = langMap[ext] ?? 'plaintext'
        openFileInIde(filePath, content, language)
        onFileSelect?.(filePath, content)
      } catch {
        // Failed to load file content
      } finally {
        setFilesLoading(false)
      }
    },
    [openFileInIde, onFileSelect, setFilesLoading]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/50 px-2 py-1">
        <span className="text-xs text-muted-foreground">Files</span>
        <button
          onClick={toggleWatching}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          title={isWatching ? 'Stop watching for changes' : 'Watch for file changes'}
        >
          {isWatching ? (
            <>
              <Eye className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Watching</span>
            </>
          ) : (
            <>
              <EyeOff className="h-3 w-3" />
              <span>Watch</span>
            </>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <FileTree
          files={rootFiles}
          onSelect={handleFileSelect}
          selectedPath={activeFilePath ?? undefined}
          onRefresh={() => {
            loadDirectory(rootPath).then(setRootFiles).catch(() => setRootFiles([]))
          }}
          expandPaths={expandPaths}
          onExpandPathsHandled={() => setExpandPaths([])}
        />
      </div>
    </div>
  )
}
