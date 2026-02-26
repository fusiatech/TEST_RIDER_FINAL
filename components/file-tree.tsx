'use client'

import { useState, useCallback } from 'react'
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface FileTreeProps {
  files: FileNode[]
  onSelect: (path: string) => void
  selectedPath?: string
}

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  onSelect: (path: string) => void
  selectedPath?: string
  onExpand?: (dirPath: string) => Promise<FileNode[]>
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '🔷'
    case 'js':
    case 'jsx':
      return '🟨'
    case 'json':
      return '📋'
    case 'css':
    case 'scss':
      return '🎨'
    case 'md':
      return '📝'
    case 'py':
      return '🐍'
    default:
      return ''
  }
}

function FileTreeNode({ node, depth, onSelect, selectedPath, onExpand }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileNode[]>(node.children ?? [])
  const [loading, setLoading] = useState(false)

  const isSelected = selectedPath === node.path
  const isDir = node.type === 'directory'

  const handleToggle = useCallback(async () => {
    if (!isDir) {
      onSelect(node.path)
      return
    }
    if (!expanded && onExpand && children.length === 0) {
      setLoading(true)
      try {
        const loaded = await onExpand(node.path)
        setChildren(loaded)
      } catch {
        setChildren([])
      } finally {
        setLoading(false)
      }
    }
    setExpanded((prev) => !prev)
  }, [isDir, expanded, onExpand, children.length, node.path, onSelect])

  const handleClick = useCallback(() => {
    if (isDir) {
      void handleToggle()
    } else {
      onSelect(node.path)
    }
  }, [isDir, handleToggle, onSelect, node.path])

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors',
          isSelected
            ? 'bg-primary/15 text-primary'
            : 'text-muted hover:bg-secondary/50 hover:text-foreground'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            {getFileIcon(node.name) ? (
              <span className="text-[10px] shrink-0">{getFileIcon(node.name)}</span>
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0" />
            )}
          </>
        )}
        <span className="truncate font-mono">{node.name}</span>
        {loading && <span className="ml-auto text-[10px] text-muted animate-pulse">...</span>}
      </button>
      {isDir && expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
              onExpand={onExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({ files, onSelect, selectedPath }: FileTreeProps) {
  const handleExpand = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`)
    if (!res.ok) return []
    const entries: FileNode[] = await res.json()
    return entries
  }, [])

  return (
    <div className="flex flex-col h-full overflow-auto text-sm">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Explorer</span>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {files.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            onSelect={onSelect}
            selectedPath={selectedPath}
            onExpand={handleExpand}
          />
        ))}
      </div>
    </div>
  )
}
