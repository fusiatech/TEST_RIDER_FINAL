'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FileText, Folder, FolderOpen, ChevronRight, ChevronDown, FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  childCount?: number
  isLazyLoaded?: boolean
}

interface FlattenedNode {
  node: FileNode
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  isLoading: boolean
}

interface FileTreeProps {
  files: FileNode[]
  onSelect: (path: string) => void
  selectedPath?: string
  onRefresh?: () => void
}

interface FileTreeNodeProps {
  flatNode: FlattenedNode
  onSelect: (path: string) => void
  selectedPath?: string
  onToggle: (path: string) => void
  onRefresh?: () => void
  renamingPath?: string
  onRenameStart?: (path: string) => void
  onRenameEnd?: () => void
  onNewItem?: (parentPath: string, type: 'file' | 'directory') => void
  onDelete?: (node: FileNode) => void
}

interface NewItemInputProps {
  parentPath: string
  type: 'file' | 'directory'
  depth: number
  onComplete: () => void
  onCancel: () => void
}

const LARGE_DIRECTORY_THRESHOLD = 100

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

function NewItemInput({ parentPath, type, depth, onComplete, onCancel }: NewItemInputProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async () => {
    if (!name.trim()) {
      onCancel()
      return
    }

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: parentPath || undefined,
          name: name.trim(),
          type,
        }),
      })

      if (res.ok) {
        toast.success(`${type === 'directory' ? 'Folder' : 'File'} created`)
        onComplete()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to create')
        onCancel()
      }
    } catch {
      toast.error('Failed to create')
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {type === 'directory' ? (
        <>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        </>
      ) : (
        <>
          <span className="w-3 shrink-0" />
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
        </>
      )}
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void handleSubmit()}
        className="flex-1 bg-transparent text-xs font-mono outline-none border-b border-primary"
        placeholder={type === 'directory' ? 'folder name' : 'file name'}
      />
    </div>
  )
}

function RenameInput({
  node,
  depth,
  onComplete,
  onCancel,
}: {
  node: FileNode
  depth: number
  onComplete: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(node.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = async () => {
    if (!name.trim() || name.trim() === node.name) {
      onCancel()
      return
    }

    try {
      const res = await fetch(`/api/files/${encodeURIComponent(node.path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: name.trim() }),
      })

      if (res.ok) {
        toast.success('Renamed successfully')
        onComplete()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to rename')
        onCancel()
      }
    } catch {
      toast.error('Failed to rename')
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const isDir = node.type === 'directory'

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 h-[26px]"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {isDir ? (
        <>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
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
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => void handleSubmit()}
        className="flex-1 bg-transparent text-xs font-mono outline-none border-b border-primary"
      />
    </div>
  )
}

function FileTreeNodeRow({
  flatNode,
  onSelect,
  selectedPath,
  onToggle,
  onRefresh,
  renamingPath,
  onRenameStart,
  onRenameEnd,
  onNewItem,
  onDelete,
}: FileTreeNodeProps) {
  const { node, depth, isExpanded, hasChildren, isLoading } = flatNode
  const isSelected = selectedPath === node.path
  const isDir = node.type === 'directory'
  const isRenaming = renamingPath === node.path
  const showChildCount = isDir && node.childCount !== undefined && node.childCount >= LARGE_DIRECTORY_THRESHOLD

  const handleClick = useCallback(() => {
    if (isDir) {
      onToggle(node.path)
    } else {
      onSelect(node.path)
    }
  }, [isDir, node.path, onSelect, onToggle])

  if (isRenaming) {
    return (
      <RenameInput
        node={node}
        depth={depth}
        onComplete={() => {
          onRenameEnd?.()
          onRefresh?.()
        }}
        onCancel={() => onRenameEnd?.()}
      />
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors h-[26px]',
            isSelected
              ? 'bg-primary/15 text-primary'
              : 'text-muted hover:bg-secondary/50 hover:text-foreground'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDir ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              {isExpanded ? (
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
          {isLoading && <span className="ml-auto text-[10px] text-muted animate-pulse">...</span>}
          {showChildCount && !isLoading && (
            <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
              {node.childCount}
            </span>
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isDir && (
          <>
            <ContextMenuItem onClick={() => onNewItem?.(node.path, 'file')}>
              <FilePlus className="h-3.5 w-3.5" />
              New File
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onNewItem?.(node.path, 'directory')}>
              <FolderPlus className="h-3.5 w-3.5" />
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={() => onRenameStart?.(node.path)}>
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem destructive onClick={() => onDelete?.(node)}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function FileTree({ files, onSelect, selectedPath, onRefresh }: FileTreeProps) {
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [newItemState, setNewItemState] = useState<{ parentPath: string; type: 'file' | 'directory' } | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [loadedChildren, setLoadedChildren] = useState<Map<string, FileNode[]>>(new Map())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [deleteNode, setDeleteNode] = useState<FileNode | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef<number>(0)

  const loadDirectory = useCallback(async (dirPath: string): Promise<FileNode[]> => {
    const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`)
    if (!res.ok) return []
    const entries: FileNode[] = await res.json()
    return entries.map(entry => ({
      ...entry,
      childCount: entry.type === 'directory' ? entry.children?.length : undefined,
      isLazyLoaded: true,
    }))
  }, [])

  const handleToggle = useCallback(async (path: string) => {
    const isExpanded = expandedPaths.has(path)
    
    if (isExpanded) {
      setExpandedPaths(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    } else {
      if (!loadedChildren.has(path)) {
        setLoadingPaths(prev => new Set(prev).add(path))
        try {
          const children = await loadDirectory(path)
          setLoadedChildren(prev => new Map(prev).set(path, children))
        } catch {
          setLoadedChildren(prev => new Map(prev).set(path, []))
        } finally {
          setLoadingPaths(prev => {
            const next = new Set(prev)
            next.delete(path)
            return next
          })
        }
      }
      setExpandedPaths(prev => new Set(prev).add(path))
    }
  }, [expandedPaths, loadedChildren, loadDirectory])

  const flattenedNodes = useMemo(() => {
    const result: FlattenedNode[] = []
    
    const flatten = (nodes: FileNode[], depth: number) => {
      for (const node of nodes) {
        const isExpanded = expandedPaths.has(node.path)
        const children = loadedChildren.get(node.path) ?? node.children ?? []
        const hasChildren = node.type === 'directory'
        const isLoading = loadingPaths.has(node.path)
        
        result.push({
          node: {
            ...node,
            childCount: node.childCount ?? children.length,
          },
          depth,
          isExpanded,
          hasChildren,
          isLoading,
        })
        
        if (isExpanded && children.length > 0) {
          flatten(children, depth + 1)
        }
      }
    }
    
    flatten(files, 0)
    return result
  }, [files, expandedPaths, loadedChildren, loadingPaths])

  const newItemIndex = useMemo(() => {
    if (!newItemState) return -1
    if (newItemState.parentPath === '') return 0
    const parentIndex = flattenedNodes.findIndex(fn => fn.node.path === newItemState.parentPath)
    return parentIndex + 1
  }, [newItemState, flattenedNodes])

  const totalItems = flattenedNodes.length + (newItemState ? 1 : 0)

  const rowVirtualizer = useVirtualizer({
    count: totalItems,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 10,
  })

  useEffect(() => {
    if (parentRef.current) {
      parentRef.current.scrollTop = scrollPositionRef.current
    }
  }, [flattenedNodes])

  const handleScroll = useCallback(() => {
    if (parentRef.current) {
      scrollPositionRef.current = parentRef.current.scrollTop
    }
  }, [])

  const handleNewItem = useCallback((parentPath: string, type: 'file' | 'directory') => {
    if (parentPath && !expandedPaths.has(parentPath)) {
      void handleToggle(parentPath)
    }
    setNewItemState({ parentPath, type })
  }, [expandedPaths, handleToggle])

  const handleNewItemComplete = useCallback(() => {
    setNewItemState(null)
    onRefresh?.()
  }, [onRefresh])

  const handleDelete = async () => {
    if (!deleteNode) return
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(deleteNode.path)}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success(`${deleteNode.type === 'directory' ? 'Folder' : 'File'} deleted`)
        onRefresh?.()
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to delete')
      }
    } catch {
      toast.error('Failed to delete')
    }
    setDeleteNode(null)
  }

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="flex flex-col h-full overflow-hidden text-sm">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Explorer</span>
            <div className="flex items-center gap-1">
              <button
                className="p-1 rounded hover:bg-secondary text-muted hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNewItem('', 'file')
                }}
                title="New File"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
              <button
                className="p-1 rounded hover:bg-secondary text-muted hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  handleNewItem('', 'directory')
                }}
                title="New Folder"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => handleNewItem('', 'file')}>
            <FilePlus className="h-3.5 w-3.5" />
            New File
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleNewItem('', 'directory')}>
            <FolderPlus className="h-3.5 w-3.5" />
            New Folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div 
        ref={parentRef} 
        className="flex-1 overflow-auto py-1"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const actualIndex = virtualRow.index
            const isNewItemRow = newItemState && actualIndex === newItemIndex
            
            if (isNewItemRow) {
              const depth = newItemState.parentPath === '' 
                ? 0 
                : (flattenedNodes.find(fn => fn.node.path === newItemState.parentPath)?.depth ?? 0) + 1
              
              return (
                <div
                  key="new-item"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <NewItemInput
                    parentPath={newItemState.parentPath}
                    type={newItemState.type}
                    depth={depth}
                    onComplete={handleNewItemComplete}
                    onCancel={() => setNewItemState(null)}
                  />
                </div>
              )
            }
            
            const nodeIndex = newItemState && actualIndex > newItemIndex ? actualIndex - 1 : actualIndex
            const flatNode = flattenedNodes[nodeIndex]
            
            if (!flatNode) return null

            return (
              <div
                key={flatNode.node.path}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <FileTreeNodeRow
                  flatNode={flatNode}
                  onSelect={onSelect}
                  selectedPath={selectedPath}
                  onToggle={handleToggle}
                  onRefresh={onRefresh}
                  renamingPath={renamingPath ?? undefined}
                  onRenameStart={setRenamingPath}
                  onRenameEnd={() => setRenamingPath(null)}
                  onNewItem={handleNewItem}
                  onDelete={setDeleteNode}
                />
              </div>
            )
          })}
        </div>
      </div>

      <AlertDialog open={!!deleteNode} onOpenChange={(open) => !open && setDeleteNode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteNode?.type === 'directory' ? 'Folder' : 'File'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteNode?.name}&quot;?
              {deleteNode?.type === 'directory' && ' This will delete all contents inside the folder.'}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
