'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileTree, type FileNode } from '@/components/file-tree'
import { useSwarmStore } from '@/lib/store'
import { Loader2 } from 'lucide-react'

interface FileBrowserProps {
  rootPath?: string
  onFileSelect?: (filePath: string, content: string) => void
}

export function FileBrowser({ rootPath, onFileSelect }: FileBrowserProps) {
  const [rootFiles, setRootFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const activeFilePath = useSwarmStore((s) => s.activeFilePath)
  const openFileInIde = useSwarmStore((s) => s.openFileInIde)

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
  }, [rootPath, loadDirectory])

  const handleFileSelect = useCallback(
    async (filePath: string) => {
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
      }
    },
    [openFileInIde, onFileSelect]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    )
  }

  return (
    <FileTree
      files={rootFiles}
      onSelect={handleFileSelect}
      selectedPath={activeFilePath ?? undefined}
    />
  )
}
