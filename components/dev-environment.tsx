'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSwarmStore, type EditorGroup, type SplitDirection } from '@/lib/store'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileBrowser } from '@/components/file-browser'

const CodeEditor = dynamic(
  () => import('@/components/code-editor').then(mod => ({ default: mod.CodeEditor })),
  { 
    loading: () => (
      <div className="h-full w-full bg-card animate-pulse flex items-center justify-center">
        <div className="text-muted text-sm">Loading editor...</div>
      </div>
    ),
    ssr: false 
  }
)
import { TerminalEmulator, type TerminalEmulatorRef } from '@/components/terminal-emulator'
import { GitPanel } from '@/components/git-panel'
import { DebuggerPanel } from '@/components/debugger-panel'
import { ProblemsPanel, ProblemsBadge, type Problem } from '@/components/problems-panel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
  Terminal,
  Save,
  Plus,
  FolderOpen,
  GitBranch,
  Code2,
  Clock,
  Folder,
  Keyboard,
  Files,
  SplitSquareHorizontal,
  Columns,
  Rows,
  GripVertical,
  GripHorizontal,
  Bug,
  Search,
  ChevronDown,
  Trash2,
  MoreVertical,
  Pencil,
  RotateCcw,
  Check,
  AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb'
import { CommandPalette } from '@/components/command-palette'
import { FolderPicker } from '@/components/folder-picker'
import { GitHubClone } from '@/components/github-clone'
import { FileSearchPanel } from '@/components/file-search-panel'
import { WorkspaceSwitcher } from '@/components/workspace-switcher'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'

const RECENT_PROJECTS_KEY = 'swarm.ide.recentProjects'
const MAX_RECENT_PROJECTS = 5

interface RecentProject {
  path: string
  name: string
  lastOpened: number
}

function getRecentProjects(): RecentProject[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addRecentProject(path: string): void {
  if (typeof window === 'undefined' || !path) return
  try {
    const projects = getRecentProjects()
    const name = path.split(/[/\\]/).pop() || path
    const filtered = projects.filter((p) => p.path !== path)
    const updated = [{ path, name, lastOpened: Date.now() }, ...filtered].slice(0, MAX_RECENT_PROJECTS)
    localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated))
  } catch {
    // Ignore localStorage errors
  }
}

interface TerminalSession {
  id: string
  name: string
  cols: number
  rows: number
  cwd: string
  createdAt: number
  lastActivityAt: number
  terminated: boolean
  exitCode: number | null
  scrollbackSize: number
}

interface TerminalSessionSnapshot extends TerminalSession {
  scrollback: string
}

const ACTIVE_TERMINAL_KEY = 'swarm.ide.activeTerminalId'

interface WelcomeScreenProps {
  onOpenFolder: () => void
  onCloneGitHub: () => void
  onOpenRecent: (path: string) => void
}

function WelcomeScreen({ onOpenFolder, onCloneGitHub, onOpenRecent }: WelcomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])

  useEffect(() => {
    setRecentProjects(getRecentProjects())
  }, [])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 max-w-lg px-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-2">
            <Code2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome to SwarmUI IDE
          </h1>
          <p className="text-muted text-sm">
            Get started by opening a project
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-24 flex-col gap-2 border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-all"
            onClick={onOpenFolder}
          >
            <FolderOpen className="h-6 w-6 text-primary" />
            <span className="font-medium">Open Folder</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-24 flex-col gap-2 border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-all"
            onClick={onCloneGitHub}
          >
            <GitBranch className="h-6 w-6 text-primary" />
            <span className="font-medium">Clone from GitHub</span>
          </Button>
        </div>

        {recentProjects.length > 0 && (
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted" />
              <h2 className="text-sm font-medium text-muted">Recent Projects</h2>
            </div>
            <div className="flex flex-col gap-1">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-card/80 transition-colors group"
                  onClick={() => onOpenRecent(project.path)}
                >
                  <Folder className="h-4 w-4 text-muted group-hover:text-primary transition-colors shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {project.name}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {project.path}
                    </div>
                  </div>
                  <span className="text-xs text-muted shrink-0">
                    {formatDate(project.lastOpened)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const EDITOR_LAYOUT_KEY = 'swarm.ide.editorLayout'

function SortableTab({
  id,
  children,
  isActive,
}: {
  id: string
  children: React.ReactNode
  isActive: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}

function saveEditorLayout(editorGroups: EditorGroup[], activeGroupId: string | null, splitDirection: SplitDirection): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(EDITOR_LAYOUT_KEY, JSON.stringify({ editorGroups, activeGroupId, splitDirection }))
  } catch {
    // Ignore localStorage errors
  }
}

export function DevEnvironment() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const settings = useSwarmStore((s) => s.settings)
  const updateSettings = useSwarmStore((s) => s.updateSettings)
  const openFiles = useSwarmStore((s) => s.openFiles)
  const activeFilePath = useSwarmStore((s) => s.activeFilePath)
  const setActiveFile = useSwarmStore((s) => s.setActiveFile)
  const closeFile = useSwarmStore((s) => s.closeFile)
  const updateFileContent = useSwarmStore((s) => s.updateFileContent)
  const openFileInIde = useSwarmStore((s) => s.openFileInIde)
  const setFilesLoading = useSwarmStore((s) => s.setFilesLoading)
  const reorderOpenFiles = useSwarmStore((s) => s.reorderOpenFiles)
  
  const editorGroups = useSwarmStore((s) => s.editorGroups)
  const activeGroupId = useSwarmStore((s) => s.activeGroupId)
  const splitDirection = useSwarmStore((s) => s.splitDirection)
  const splitEditor = useSwarmStore((s) => s.splitEditor)
  const closeEditorGroup = useSwarmStore((s) => s.closeEditorGroup)
  const setActiveGroup = useSwarmStore((s) => s.setActiveGroup)
  const setActiveFileInGroup = useSwarmStore((s) => s.setActiveFileInGroup)
  const closeFileInGroup = useSwarmStore((s) => s.closeFileInGroup)
  const updateFileContentInGroup = useSwarmStore((s) => s.updateFileContentInGroup)

  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [terminalVisible, setTerminalVisible] = useState(true)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [githubCloneOpen, setGithubCloneOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [fileSearchOpen, setFileSearchOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'files' | 'git' | 'debug' | 'search'>('files')
  const [originalContents, setOriginalContents] = useState<Map<string, string>>(new Map())
  const [unsavedCloseFile, setUnsavedCloseFile] = useState<string | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [showProblemsPanel, setShowProblemsPanel] = useState(false)
  const [tabsOverflow, setTabsOverflow] = useState(false)
  const [allFilesMenuOpen, setAllFilesMenuOpen] = useState(false)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  
  const fileLoading = useSwarmStore((s) => s.filesLoading)

  const hasProjectPath = Boolean(settings.projectPath)

  // G-IA-01: Update URL when file changes
  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    router.push(`?${params.toString()}`, { scroll: false })
  }, [searchParams, router])

  // G-IA-01: Update URL when active file changes
  useEffect(() => {
    const currentFileParam = searchParams.get('file')
    if (activeFilePath && activeFilePath !== currentFileParam) {
      updateUrlParams({ file: activeFilePath })
    } else if (!activeFilePath && currentFileParam) {
      updateUrlParams({ file: null })
    }
  }, [activeFilePath, searchParams, updateUrlParams])

  // G-IA-01: Restore file from URL on mount
  useEffect(() => {
    const fileParam = searchParams.get('file')
    if (fileParam && hasProjectPath && !activeFilePath) {
      const loadFileFromUrl = async () => {
        setFilesLoading(true)
        try {
          const res = await fetch(`/api/files/${encodeURIComponent(fileParam)}`)
          if (!res.ok) return
          const content = await res.text()
          const ext = fileParam.split('.').pop()?.toLowerCase() ?? ''
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
          openFileInIde(fileParam, content, language)
        } catch {
          // Failed to load file from URL
        } finally {
          setFilesLoading(false)
        }
      }
      void loadFileFromUrl()
    }
  }, [searchParams, hasProjectPath, activeFilePath, openFileInIde, setFilesLoading])

  useEffect(() => {
    if (settings.projectPath) {
      addRecentProject(settings.projectPath)
    }
  }, [settings.projectPath])

  useEffect(() => {
    if (editorGroups.length > 0) {
      saveEditorLayout(editorGroups, activeGroupId, splitDirection)
    }
  }, [editorGroups, activeGroupId, splitDirection])

  const handleOpenRecent = useCallback((path: string) => {
    updateSettings({ projectPath: path })
  }, [updateSettings])

  const [sidebarWidth, setSidebarWidth] = useState(220)
  const [terminalHeight, setTerminalHeight] = useState(200)
  const [previewWidth, setPreviewWidth] = useState(350)
  const [splitSizes, setSplitSizes] = useState<number[]>([50, 50])
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [activeTerminal, setActiveTerminal] = useState<TerminalSessionSnapshot | null>(null)
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const sidebarDragRef = useRef<boolean>(false)
  const terminalDragRef = useRef<boolean>(false)
  const previewDragRef = useRef<boolean>(false)
  const splitDragRef = useRef<{ dragging: boolean; index: number }>({ dragging: false, index: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const terminalEmulatorRef = useRef<TerminalEmulatorRef>(null)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  // G-IDE-01: Drag-and-drop sensors for tab reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleTabDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = openFiles.findIndex((f) => f.path === active.id)
      const newIndex = openFiles.findIndex((f) => f.path === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderOpenFiles(oldIndex, newIndex)
      }
    }
  }, [openFiles, reorderOpenFiles])

  const handleClearTerminal = useCallback(() => {
    terminalEmulatorRef.current?.clear()
  }, [])

  const refreshSessions = useCallback(async () => {
    const res = await fetch('/api/terminal', { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as { sessions: TerminalSession[] }
    setTerminalSessions(data.sessions)

    if (!activeTerminalId && data.sessions.length > 0) {
      const persisted = localStorage.getItem(ACTIVE_TERMINAL_KEY)
      const matched = data.sessions.find((s) => s.id === persisted)
      setActiveTerminalId(matched?.id ?? data.sessions[0].id)
    }
  }, [activeTerminalId])

  const createTerminalSession = useCallback(async () => {
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols: 120, rows: 32 }),
    })
    if (!res.ok) {
      toast.error('Failed to create terminal session')
      return
    }

    const data = (await res.json()) as { session: TerminalSession }
    setActiveTerminalId(data.session.id)
    await refreshSessions()
  }, [refreshSessions])

  const terminateTerminal = useCallback(
    async (id: string) => {
      await fetch(`/api/terminal/${id}/terminate`, { method: 'POST' })
      await refreshSessions()
      if (id === activeTerminalId) {
        const next = terminalSessions.find((s) => s.id !== id && !s.terminated)
        setActiveTerminalId(next?.id ?? null)
      }
    },
    [activeTerminalId, refreshSessions, terminalSessions]
  )

  const restoreTerminal = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/terminal/${id}/restore`, { method: 'POST' })
      if (!res.ok) {
        toast.error('Failed to restore terminal')
        return
      }
      await refreshSessions()
      setActiveTerminalId(id)
      toast.success('Terminal restored')
    },
    [refreshSessions]
  )

  const deleteTerminal = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/terminal/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to delete terminal')
        return
      }
      await refreshSessions()
      if (id === activeTerminalId) {
        const next = terminalSessions.find((s) => s.id !== id)
        setActiveTerminalId(next?.id ?? null)
      }
      toast.success('Terminal deleted')
    },
    [activeTerminalId, refreshSessions, terminalSessions]
  )

  const renameTerminal = useCallback(
    async (id: string, name: string) => {
      const res = await fetch(`/api/terminal/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        toast.error('Failed to rename terminal')
        return
      }
      await refreshSessions()
      setRenamingTerminalId(null)
      setRenameValue('')
    },
    [refreshSessions]
  )

  const startRenaming = useCallback((session: TerminalSession) => {
    setRenamingTerminalId(session.id)
    setRenameValue(session.name)
  }, [])

  const sendToTerminal = useCallback(
    async (input: string) => {
      if (!activeTerminalId) return
      await fetch(`/api/terminal/${activeTerminalId}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
    },
    [activeTerminalId]
  )

  const resizeActiveTerminal = useCallback(async () => {
    if (!activeTerminalId || !containerRef.current || !terminalVisible) return
    const width = containerRef.current.clientWidth - (sidebarVisible ? sidebarWidth : 0) - (previewVisible ? previewWidth : 0)
    const cols = Math.max(20, Math.floor(width / 8))
    const rows = Math.max(5, Math.floor((terminalHeight - 28) / 18))

    await fetch(`/api/terminal/${activeTerminalId}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    })
  }, [activeTerminalId, previewVisible, previewWidth, sidebarVisible, sidebarWidth, terminalHeight, terminalVisible])

  const handleAutoSave = useCallback(async (filePath: string, content: string) => {
    setIsAutoSaving(true)
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        body: content,
      })
      if (res.ok) {
        setOriginalContents((prev) => {
          const next = new Map(prev)
          next.set(filePath, content)
          return next
        })
      }
    } catch {
      // Silent fail for auto-save
    } finally {
      setIsAutoSaving(false)
    }
  }, [])

  const handleEditorChange = useCallback(
    (value: string) => {
      if (activeFilePath) {
        updateFileContent(activeFilePath, value)

        if (settings.autoSave) {
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current)
          }
          const filePath = activeFilePath
          autoSaveTimeoutRef.current = setTimeout(() => {
            void handleAutoSave(filePath, value)
          }, settings.autoSaveDelay ?? 1000)
        }
      }
    },
    [activeFilePath, updateFileContent, settings.autoSave, settings.autoSaveDelay, handleAutoSave]
  )

  const isFileDirty = useCallback((filePath: string): boolean => {
    const file = openFiles.find((f) => f.path === filePath)
    const original = originalContents.get(filePath)
    if (!file || original === undefined) return false
    return file.content !== original
  }, [openFiles, originalContents])

  const hasUnsavedChanges = useMemo(() => {
    return openFiles.some((f) => isFileDirty(f.path))
  }, [openFiles, isFileDirty])

  const handleCloseFileWithCheck = useCallback((filePath: string) => {
    if (isFileDirty(filePath)) {
      setUnsavedCloseFile(filePath)
    } else {
      closeFile(filePath)
      setOriginalContents((prev) => {
        const next = new Map(prev)
        next.delete(filePath)
        return next
      })
    }
  }, [isFileDirty, closeFile])

  const confirmCloseFile = useCallback(() => {
    if (unsavedCloseFile) {
      closeFile(unsavedCloseFile)
      setOriginalContents((prev) => {
        const next = new Map(prev)
        next.delete(unsavedCloseFile)
        return next
      })
      setUnsavedCloseFile(null)
    }
  }, [unsavedCloseFile, closeFile])

  const trackOriginalContent = useCallback((filePath: string, content: string) => {
    setOriginalContents((prev) => {
      if (prev.has(filePath)) return prev
      const next = new Map(prev)
      next.set(filePath, content)
      return next
    })
  }, [])

  const handleSaveFile = useCallback(async () => {
    if (!activeFile) return
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(activeFile.path)}`, {
        method: 'PUT',
        body: activeFile.content,
      })
      if (res.ok) {
        toast.success('File saved')
        setOriginalContents((prev) => {
          const next = new Map(prev)
          next.set(activeFile.path, activeFile.content)
          return next
        })
      } else {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to save')
      }
    } catch {
      toast.error('Failed to save file')
    }
  }, [activeFile])

  useEffect(() => {
    const init = async () => {
      await refreshSessions()
    }
    void init()
  }, [refreshSessions])

  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    openFiles.forEach((file) => {
      trackOriginalContent(file.path, file.content)
    })
  }, [openFiles, trackOriginalContent])

  useEffect(() => {
    const checkOverflow = () => {
      if (tabsContainerRef.current) {
        const { scrollWidth, clientWidth } = tabsContainerRef.current
        setTabsOverflow(scrollWidth > clientWidth)
      }
    }
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [openFiles.length])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (!activeTerminalId) return
    localStorage.setItem(ACTIVE_TERMINAL_KEY, activeTerminalId)
  }, [activeTerminalId])

  useEffect(() => {
    if (!activeTerminalId) {
      setActiveTerminal(null)
      return
    }

    const poll = async () => {
      const res = await fetch(`/api/terminal/${activeTerminalId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { session: TerminalSessionSnapshot }
      setActiveTerminal(data.session)
    }

    void poll()
    const interval = setInterval(() => {
      void poll()
      void refreshSessions()
    }, 700)

    return () => clearInterval(interval)
  }, [activeTerminalId, refreshSessions])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarDragRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newWidth = Math.max(120, Math.min(400, e.clientX - rect.left))
        setSidebarWidth(newWidth)
      }
      if (terminalDragRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newHeight = Math.max(80, Math.min(500, rect.bottom - e.clientY))
        setTerminalHeight(newHeight)
      }
      if (previewDragRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const newWidth = Math.max(200, Math.min(600, rect.right - e.clientX))
        setPreviewWidth(newWidth)
      }
      if (splitDragRef.current.dragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const editorAreaLeft = sidebarVisible ? sidebarWidth + 4 : 0
        const editorAreaRight = previewVisible ? rect.width - previewWidth - 4 : rect.width
        const editorAreaTop = 0
        const editorAreaBottom = terminalVisible ? rect.height - terminalHeight - 4 : rect.height
        
        if (splitDirection === 'horizontal') {
          const totalWidth = editorAreaRight - editorAreaLeft
          const relativeX = e.clientX - rect.left - editorAreaLeft
          const percentage = Math.max(20, Math.min(80, (relativeX / totalWidth) * 100))
          setSplitSizes([percentage, 100 - percentage])
        } else {
          const totalHeight = editorAreaBottom - editorAreaTop - 40
          const relativeY = e.clientY - rect.top - editorAreaTop - 40
          const percentage = Math.max(20, Math.min(80, (relativeY / totalHeight) * 100))
          setSplitSizes([percentage, 100 - percentage])
        }
      }
    }

    const handleMouseUp = () => {
      sidebarDragRef.current = false
      terminalDragRef.current = false
      previewDragRef.current = false
      splitDragRef.current = { dragging: false, index: 0 }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      void resizeActiveTerminal()
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizeActiveTerminal, sidebarVisible, sidebarWidth, previewVisible, previewWidth, terminalVisible, terminalHeight, splitDirection])

  useEffect(() => {
    const timer = setTimeout(() => {
      void resizeActiveTerminal()
    }, 120)
    return () => clearTimeout(timer)
  }, [resizeActiveTerminal])

  const terminalLabel = useMemo(() => {
    if (!activeTerminal) return 'Terminal'
    if (activeTerminal.terminated) {
      return `Terminal (exited ${activeTerminal.exitCode ?? 'unknown'})`
    }
    return 'Terminal'
  }, [activeTerminal])

  const [navigateToPath, setNavigateToPath] = useState<string | null>(null)

  const handleBreadcrumbNavigate = useCallback((targetPath: string) => {
    setNavigateToPath(targetPath)
    setSidebarVisible(true)
    setSidebarTab('files')
  }, [])

  // G-IA-02: Compute breadcrumb items from project path and active file
  const breadcrumbItems = useMemo((): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = []
    
    if (!settings.projectPath) return items
    
    const projectName = settings.projectPath.split(/[/\\]/).pop() || 'Project'
    items.push({
      label: projectName,
      path: settings.projectPath,
      onClick: () => settings.projectPath && handleBreadcrumbNavigate(settings.projectPath),
    })
    
    if (activeFilePath) {
      const relativePath = activeFilePath.startsWith(settings.projectPath)
        ? activeFilePath.slice(settings.projectPath.length).replace(/^[/\\]/, '')
        : activeFilePath
      
      const parts = relativePath.split(/[/\\]/)
      const fileName = parts.pop() || ''
      
      if (parts.length > 0) {
        let currentPath = settings.projectPath
        
        if (parts.length > 3) {
          items.push({ label: '...' })
          const lastTwoParts = parts.slice(-2)
          const pathBeforeLastTwo = parts.slice(0, -2)
          currentPath = settings.projectPath + '/' + pathBeforeLastTwo.join('/')
          
          lastTwoParts.forEach((part) => {
            currentPath = currentPath + '/' + part
            const fullPath = currentPath
            items.push({
              label: part,
              path: fullPath,
              onClick: () => handleBreadcrumbNavigate(fullPath),
            })
          })
        } else {
          parts.forEach((part) => {
            currentPath = currentPath + '/' + part
            const fullPath = currentPath
            items.push({
              label: part,
              path: fullPath,
              onClick: () => handleBreadcrumbNavigate(fullPath),
            })
          })
        }
      }
      
      if (fileName) {
        items.push({ label: fileName, path: activeFilePath })
      }
    }
    
    return items
  }, [settings.projectPath, activeFilePath, handleBreadcrumbNavigate])

  // G-IDE-02: Keyboard shortcuts handler
  const handleNextTab = useCallback(() => {
    if (openFiles.length <= 1) return
    const currentIndex = openFiles.findIndex((f) => f.path === activeFilePath)
    const nextIndex = (currentIndex + 1) % openFiles.length
    setActiveFile(openFiles[nextIndex].path)
  }, [openFiles, activeFilePath, setActiveFile])

  const handlePrevTab = useCallback(() => {
    if (openFiles.length <= 1) return
    const currentIndex = openFiles.findIndex((f) => f.path === activeFilePath)
    const prevIndex = currentIndex <= 0 ? openFiles.length - 1 : currentIndex - 1
    setActiveFile(openFiles[prevIndex].path)
  }, [openFiles, activeFilePath, setActiveFile])

  const handleFocusGroup = useCallback((index: number) => {
    if (editorGroups.length > index) {
      setActiveGroup(editorGroups[index].id)
    }
  }, [editorGroups, setActiveGroup])

  const handleSplitEditor = useCallback(() => {
    splitEditor(splitDirection)
  }, [splitEditor, splitDirection])

  // G-IDE-02: Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      if (modKey && e.key === 's') {
        e.preventDefault()
        void handleSaveFile()
      } else if (modKey && e.key === 'w') {
        e.preventDefault()
        if (activeFilePath) {
          handleCloseFileWithCheck(activeFilePath)
        }
      } else if (modKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        handlePrevTab()
      } else if (modKey && e.key === 'Tab') {
        e.preventDefault()
        handleNextTab()
      } else if (modKey && e.key === 'p') {
        e.preventDefault()
        setCommandPaletteOpen((prev) => !prev)
      } else if (modKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setFileSearchOpen((prev) => !prev)
      } else if (modKey && e.key === '\\') {
        e.preventDefault()
        handleSplitEditor()
      } else if (modKey && e.key === '1') {
        e.preventDefault()
        handleFocusGroup(0)
      } else if (modKey && e.key === '2') {
        e.preventDefault()
        handleFocusGroup(1)
      } else if (modKey && e.key === '3') {
        e.preventDefault()
        handleFocusGroup(2)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveFile, handleCloseFileWithCheck, activeFilePath, handleNextTab, handlePrevTab, handleSplitEditor, handleFocusGroup])

  // G-IDE-05: Keyboard shortcuts list for discovery
  const keyboardShortcuts = [
    { keys: 'Ctrl+S', action: 'Save current file', mac: '⌘S' },
    { keys: 'Ctrl+W', action: 'Close current tab', mac: '⌘W' },
    { keys: 'Ctrl+Tab', action: 'Next tab', mac: '⌘Tab' },
    { keys: 'Ctrl+Shift+Tab', action: 'Previous tab', mac: '⌘⇧Tab' },
    { keys: 'Ctrl+P', action: 'Quick open file', mac: '⌘P' },
    { keys: 'Ctrl+Shift+F', action: 'Search in files', mac: '⌘⇧F' },
    { keys: 'Ctrl+\\', action: 'Split editor', mac: '⌘\\' },
    { keys: 'Ctrl+1', action: 'Focus editor group 1', mac: '⌘1' },
    { keys: 'Ctrl+2', action: 'Focus editor group 2', mac: '⌘2' },
    { keys: 'Ctrl+3', action: 'Focus editor group 3', mac: '⌘3' },
  ]

  if (!hasProjectPath) {
    return (
      <>
        <FolderPicker
          open={folderPickerOpen}
          onOpenChange={setFolderPickerOpen}
          initialPath={settings.projectPath}
        />
        <GitHubClone
          open={githubCloneOpen}
          onOpenChange={setGithubCloneOpen}
        />
        <CommandPalette
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
        />
        <FileSearchPanel
          open={fileSearchOpen}
          onOpenChange={setFileSearchOpen}
        />
        <WelcomeScreen
          onOpenFolder={() => setFolderPickerOpen(true)}
          onCloneGitHub={() => setGithubCloneOpen(true)}
          onOpenRecent={handleOpenRecent}
        />
      </>
    )
  }

  const previewUrl = settings.previewUrl || process.env.NEXT_PUBLIC_PREVIEW_URL || 'http://localhost:3000'

  return (
    <>
    <FolderPicker
      open={folderPickerOpen}
      onOpenChange={setFolderPickerOpen}
      initialPath={settings.projectPath}
    />
    <GitHubClone
      open={githubCloneOpen}
      onOpenChange={setGithubCloneOpen}
    />
    <CommandPalette
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
    />
    <FileSearchPanel
      open={fileSearchOpen}
      onOpenChange={setFileSearchOpen}
    />
    <AlertDialog open={!!unsavedCloseFile} onOpenChange={(open) => !open && setUnsavedCloseFile(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            This file has unsaved changes. Do you want to close it without saving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirmCloseFile}>
            Close Without Saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-1 border-b border-border bg-card/50 px-2 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSidebarVisible((v) => !v)}
          title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarVisible ? (
            <PanelLeftClose className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTerminalVisible((v) => !v)}
          title={terminalVisible ? 'Hide terminal' : 'Show terminal'}
        >
          {terminalVisible ? (
            <PanelBottomClose className="h-3.5 w-3.5" />
          ) : (
            <PanelBottomOpen className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setPreviewVisible((v) => !v)}
          title={previewVisible ? 'Hide preview' : 'Show preview'}
        >
          {previewVisible ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setFolderPickerOpen(true)}
          title="Open folder"
        >
          <FolderOpen className="h-3 w-3" />
          Open Folder
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setGithubCloneOpen(true)}
          title="Clone from GitHub"
        >
          <GitBranch className="h-3 w-3" />
          Clone from GitHub
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        {/* G-IA-02: Breadcrumb navigation */}
        <Breadcrumb items={breadcrumbItems} className="flex-1 min-w-0" />
        {activeFile && (
          <div className="flex items-center gap-1">
            {isAutoSaving && (
              <span className="text-[10px] text-muted animate-pulse" aria-live="polite">
                Auto-saving...
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleSaveFile}
            >
              <Save className="h-3 w-3" />
              Save
            </Button>
          </div>
        )}
        {/* G-IDE-05: Keyboard shortcuts discovery */}
        <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Keyboard shortcuts"
            >
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-4">
              {keyboardShortcuts.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between py-1.5"
                >
                  <span className="text-sm text-muted">{shortcut.action}</span>
                  <kbd className="rounded bg-secondary px-2 py-1 text-xs font-mono">
                    {typeof navigator !== 'undefined' &&
                    navigator.platform.toUpperCase().indexOf('MAC') >= 0
                      ? shortcut.mac
                      : shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-1 min-h-0">
        {sidebarVisible && (
          <>
            <div
              className="shrink-0 border-r border-border bg-card/30 overflow-hidden flex flex-col"
              style={{ width: sidebarWidth }}
            >
              {/* Workspace Switcher */}
              <div className="p-2 border-b border-border">
                <WorkspaceSwitcher />
              </div>
              <div className="flex border-b border-border">
                <button
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
                    sidebarTab === 'files'
                      ? 'bg-background text-foreground border-b-2 border-primary'
                      : 'text-muted hover:text-foreground hover:bg-card/50'
                  )}
                  onClick={() => setSidebarTab('files')}
                  title="Explorer"
                >
                  <Files className="h-3.5 w-3.5" />
                </button>
                <button
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
                    sidebarTab === 'search'
                      ? 'bg-background text-foreground border-b-2 border-primary'
                      : 'text-muted hover:text-foreground hover:bg-card/50'
                  )}
                  onClick={() => setSidebarTab('search')}
                  title="Search (Ctrl+Shift+F)"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
                <button
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
                    sidebarTab === 'git'
                      ? 'bg-background text-foreground border-b-2 border-primary'
                      : 'text-muted hover:text-foreground hover:bg-card/50'
                  )}
                  onClick={() => setSidebarTab('git')}
                  title="Source Control"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                </button>
                <button
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors',
                    sidebarTab === 'debug'
                      ? 'bg-background text-foreground border-b-2 border-primary'
                      : 'text-muted hover:text-foreground hover:bg-card/50'
                  )}
                  onClick={() => setSidebarTab('debug')}
                  title="Debugger"
                >
                  <Bug className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {sidebarTab === 'files' && (
                  <div data-testid="file-tree">
                    <FileBrowser
                      rootPath={settings.projectPath}
                      navigateToPath={navigateToPath}
                      onNavigateComplete={() => setNavigateToPath(null)}
                    />
                  </div>
                )}
                {sidebarTab === 'search' && (
                  <div className="flex flex-col h-full p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start gap-2 text-muted"
                      onClick={() => setFileSearchOpen(true)}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span className="text-xs">Search in files...</span>
                      <kbd className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono">
                        {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘⇧F' : 'Ctrl+Shift+F'}
                      </kbd>
                    </Button>
                  </div>
                )}
                {sidebarTab === 'git' && (
                  <GitPanel />
                )}
                {sidebarTab === 'debug' && (
                  <DebuggerPanel />
                )}
              </div>
            </div>
            <div
              className="w-2 cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors flex items-center justify-center group"
              onMouseDown={(e) => {
                e.preventDefault()
                sidebarDragRef.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <GripVertical className="h-4 w-3 text-muted/30 group-hover:text-muted/60 transition-colors" />
            </div>
          </>
        )}

        <div className="flex flex-1 flex-col min-w-0">
          {/* Split editor toolbar */}
          <div className="flex items-center gap-1 border-b border-border bg-card/30 px-2 py-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1.5 text-xs"
                  title="Split editor"
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  Split
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => splitEditor('horizontal')}>
                  <Columns className="h-4 w-4 mr-2" />
                  Split Horizontal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => splitEditor('vertical')}>
                  <Rows className="h-4 w-4 mr-2" />
                  Split Vertical
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {editorGroups.length > 1 && (
              <>
                <div className="mx-1 h-4 w-px bg-border" />
                <span className="text-xs text-muted">
                  {editorGroups.length} groups ({splitDirection})
                </span>
              </>
            )}
          </div>

          {/* Editor groups container */}
          <div
            className={cn(
              'flex-1 min-h-0 flex',
              splitDirection === 'vertical' ? 'flex-col' : 'flex-row'
            )}
          >
            {editorGroups.length === 0 ? (
              // Single editor (no split)
              <>
                {openFiles.length > 0 && (
                  <div className="flex flex-col flex-1 min-w-0 min-h-0">
                    <div className="flex items-center border-b border-border bg-card/30 shrink-0">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleTabDragEnd}
                      >
                        <SortableContext
                          items={openFiles.map((f) => f.path)}
                          strategy={horizontalListSortingStrategy}
                        >
                          <div
                            ref={tabsContainerRef}
                            className="flex flex-1 overflow-x-auto scrollbar-hide"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                          >
                            {openFiles.map((file, index) => {
                              const isDirty = isFileDirty(file.path)
                              return (
                                <SortableTab
                                  key={file.path}
                                  id={file.path}
                                  isActive={file.path === activeFilePath}
                                >
                                  <div
                                    className={cn(
                                      'flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs cursor-pointer shrink-0',
                                      file.path === activeFilePath
                                        ? 'bg-background text-foreground'
                                        : 'bg-card/50 text-muted hover:text-foreground'
                                    )}
                                    onClick={() => setActiveFile(file.path)}
                                    data-testid={`editor-tab-${index}`}
                                  >
                                    {isDirty && (
                                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" title="Unsaved changes" />
                                    )}
                                    <span className="font-mono truncate max-w-[120px]">
                                      {file.path.split('/').pop()}
                                    </span>
                                    <button
                                      className="ml-1 rounded p-0.5 hover:bg-secondary"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleCloseFileWithCheck(file.path)
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                </SortableTab>
                              )
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                      {tabsOverflow && (
                        <DropdownMenu open={allFilesMenuOpen} onOpenChange={setAllFilesMenuOpen}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 border-l border-border rounded-none"
                              title="All open files"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                            {openFiles.map((file) => {
                              const isDirty = isFileDirty(file.path)
                              return (
                                <DropdownMenuItem
                                  key={file.path}
                                  onClick={() => setActiveFile(file.path)}
                                  className="flex items-center gap-2"
                                >
                                  {isDirty && (
                                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                  )}
                                  <span className="flex-1 truncate max-w-[200px] font-mono text-xs">
                                    {file.path.split(/[/\\]/).pop()}
                                  </span>
                                  <button
                                    className="ml-2 rounded p-0.5 hover:bg-secondary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleCloseFileWithCheck(file.path)
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="flex-1 min-h-0">
                      {fileLoading ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                          <Spinner size="lg" />
                          <div className="space-y-2 w-64">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-1/2" />
                          </div>
                          <span className="text-sm text-muted">Loading file...</span>
                        </div>
                      ) : activeFile ? (
                        <CodeEditor
                          filePath={activeFile.path}
                          content={activeFile.content}
                          language={activeFile.language}
                          onChange={handleEditorChange}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted">
                          Open a file from the sidebar to start editing
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {openFiles.length === 0 && (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted">
                    Open a file from the sidebar to start editing
                  </div>
                )}
              </>
            ) : (
              // Split editor groups
              editorGroups.map((group, index) => {
                const isActive = group.id === activeGroupId
                const activeGroupFile = group.files.find((f) => f.path === group.activeFilePath)
                const sizeStyle = splitDirection === 'horizontal'
                  ? { width: `${splitSizes[index] || 100 / editorGroups.length}%` }
                  : { height: `${splitSizes[index] || 100 / editorGroups.length}%` }

                return (
                  <div key={group.id} className="contents">
                    <div
                      className={cn(
                        'flex flex-col min-w-0 min-h-0 border',
                        isActive ? 'border-primary/50' : 'border-transparent',
                        splitDirection === 'horizontal' ? 'border-r' : 'border-b'
                      )}
                      style={sizeStyle}
                      onClick={() => setActiveGroup(group.id)}
                    >
                      {/* Group header with tabs */}
                      <div className="flex items-center border-b border-border bg-card/30 overflow-x-auto shrink-0">
                        <div className="flex flex-1 overflow-x-auto">
                          {group.files.map((file) => (
                            <div
                              key={file.path}
                              className={cn(
                                'flex items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs cursor-pointer shrink-0',
                                file.path === group.activeFilePath
                                  ? 'bg-background text-foreground'
                                  : 'bg-card/50 text-muted hover:text-foreground'
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveFileInGroup(group.id, file.path)
                              }}
                            >
                              <span className="font-mono truncate max-w-[120px]">
                                {file.path.split('/').pop()}
                              </span>
                              <button
                                className="ml-1 rounded p-0.5 hover:bg-secondary"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  closeFileInGroup(group.id, file.path)
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                        {editorGroups.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 mr-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              closeEditorGroup(group.id)
                            }}
                            title="Close group"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      {/* Editor content */}
                      <div className="flex-1 min-h-0">
                        {fileLoading && isActive ? (
                          <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Spinner size="md" />
                            <span className="text-sm text-muted">Loading file...</span>
                          </div>
                        ) : activeGroupFile ? (
                          <CodeEditor
                            filePath={activeGroupFile.path}
                            content={activeGroupFile.content}
                            language={activeGroupFile.language}
                            onChange={(value) => updateFileContentInGroup(group.id, activeGroupFile.path, value)}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-muted">
                            {group.files.length === 0
                              ? 'Drop a file here or open from sidebar'
                              : 'Select a file to edit'}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Resize handle between groups */}
                    {index < editorGroups.length - 1 && (
                      <div
                        className={cn(
                          'shrink-0 bg-transparent hover:bg-primary/20 transition-colors flex items-center justify-center group',
                          splitDirection === 'horizontal'
                            ? 'w-2 cursor-col-resize'
                            : 'h-2 cursor-row-resize'
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          splitDragRef.current = { dragging: true, index }
                          document.body.style.cursor = splitDirection === 'horizontal' ? 'col-resize' : 'row-resize'
                          document.body.style.userSelect = 'none'
                        }}
                      >
                        {splitDirection === 'horizontal' ? (
                          <GripVertical className="h-4 w-3 text-muted/30 group-hover:text-muted/60 transition-colors" />
                        ) : (
                          <GripHorizontal className="h-3 w-4 text-muted/30 group-hover:text-muted/60 transition-colors" />
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {terminalVisible && (
            <div
              className="h-2 cursor-row-resize bg-transparent hover:bg-primary/20 transition-colors flex items-center justify-center group"
              onMouseDown={(e) => {
                e.preventDefault()
                terminalDragRef.current = true
                document.body.style.cursor = 'row-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <GripHorizontal className="h-3 w-4 text-muted/30 group-hover:text-muted/60 transition-colors" />
            </div>
          )}

          {terminalVisible && (
            <div
              className="shrink-0 border-t border-border bg-card/30 overflow-hidden"
              style={{ height: terminalHeight }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-1">
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                    !showProblemsPanel
                      ? 'bg-primary/20 text-foreground'
                      : 'text-muted hover:text-foreground'
                  )}
                  onClick={() => setShowProblemsPanel(false)}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{terminalLabel}</span>
                </button>
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                    showProblemsPanel
                      ? 'bg-primary/20 text-foreground'
                      : 'text-muted hover:text-foreground'
                  )}
                  onClick={() => setShowProblemsPanel(true)}
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Problems</span>
                  <ProblemsBadge problems={problems} />
                </button>
                <div className="mx-2 h-4 w-px bg-border" />
                <div className="flex items-center gap-1 overflow-x-auto flex-1">
                  {terminalSessions.map((session) => (
                    <div key={session.id} className="flex items-center group">
                      {renamingTerminalId === session.id ? (
                        <form
                          className="flex items-center"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void renameTerminal(session.id, renameValue)
                          }}
                        >
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="h-5 w-24 text-[11px] px-1"
                            autoFocus
                            onBlur={() => {
                              if (renameValue.trim()) {
                                void renameTerminal(session.id, renameValue)
                              } else {
                                setRenamingTerminalId(null)
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setRenamingTerminalId(null)
                              }
                            }}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 ml-0.5"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </form>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className={cn(
                                'rounded px-2 py-0.5 text-[11px] font-mono flex items-center gap-1',
                                activeTerminalId === session.id
                                  ? 'bg-primary/20 text-foreground'
                                  : 'text-muted hover:text-foreground',
                                session.terminated && 'opacity-60'
                              )}
                              onClick={(e) => {
                                if (!e.defaultPrevented) {
                                  setActiveTerminalId(session.id)
                                }
                              }}
                            >
                              <span className="truncate max-w-[100px]">{session.name}</span>
                              {session.terminated && (
                                <span className="text-[9px] text-muted">(exited)</span>
                              )}
                              <MoreVertical className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-40">
                            <DropdownMenuItem onClick={() => startRenaming(session)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            {session.terminated ? (
                              <DropdownMenuItem onClick={() => void restoreTerminal(session.id)}>
                                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                                Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => void terminateTerminal(session.id)}>
                                <X className="h-3.5 w-3.5 mr-2" />
                                Terminate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void deleteTerminal(session.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleClearTerminal}
                  title="Clear terminal output"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void createTerminalSession()} title="New terminal">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                {activeTerminalId && !activeTerminal?.terminated && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void terminateTerminal(activeTerminalId)} title="Terminate terminal">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="h-[calc(100%-28px)]" data-testid="terminal">
                {showProblemsPanel ? (
                  <ProblemsPanel
                    problems={problems}
                    onProblemClick={(problem) => {
                      if (settings.projectPath) {
                        const fullPath = problem.file.startsWith(settings.projectPath)
                          ? problem.file
                          : `${settings.projectPath}/${problem.file}`
                        openFileInIde(fullPath, '', 'plaintext')
                      }
                      setShowProblemsPanel(false)
                    }}
                  />
                ) : (
                  <TerminalEmulator
                    ref={terminalEmulatorRef}
                    sessionId={activeTerminalId}
                    terminated={activeTerminal?.terminated}
                    onInput={(data) => void sendToTerminal(data)}
                    onResize={(cols, rows) => {
                      if (activeTerminalId) {
                        void fetch(`/api/terminal/${activeTerminalId}/resize`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ cols, rows }),
                        })
                      }
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {previewVisible && (
          <>
            <div
              className="w-2 cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors flex items-center justify-center group"
              onMouseDown={(e) => {
                e.preventDefault()
                previewDragRef.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            >
              <GripVertical className="h-4 w-3 text-muted/30 group-hover:text-muted/60 transition-colors" />
            </div>
            <div
              className="shrink-0 border-l border-border bg-card/30 overflow-hidden"
              style={{ width: previewWidth }}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-xs font-medium text-muted">Preview</span>
              </div>
              <iframe
                src={settings.projectPath ? previewUrl : 'about:blank'}
                className="h-[calc(100%-32px)] w-full border-0"
                title="Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
