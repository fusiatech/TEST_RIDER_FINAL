'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSwarmStore } from '@/lib/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  Plus,
  Minus,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Upload,
  Download,
  FileText,
  Trash2,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Archive,
  MoreHorizontal,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ConflictList, type ConflictFile } from '@/components/conflict-editor'

interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied'
  staged: boolean
  oldPath?: string
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFileStatus[]
  isRepo: boolean
}

const STATUS_ICONS: Record<GitFileStatus['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: 'U',
  renamed: 'R',
  copied: 'C',
}

const STATUS_COLORS: Record<GitFileStatus['status'], string> = {
  modified: 'text-yellow-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  untracked: 'text-gray-400',
  renamed: 'text-blue-500',
  copied: 'text-blue-500',
}

export function GitPanel() {
  const settings = useSwarmStore((s) => s.settings)
  const branches = useSwarmStore((s) => s.branches)
  const currentBranch = useSwarmStore((s) => s.currentBranch)
  const branchesLoading = useSwarmStore((s) => s.branchesLoading)
  const fetchBranches = useSwarmStore((s) => s.fetchBranches)
  const createBranch = useSwarmStore((s) => s.createBranch)
  const checkoutBranch = useSwarmStore((s) => s.checkoutBranch)
  const deleteBranch = useSwarmStore((s) => s.deleteBranch)

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [changesExpanded, setChangesExpanded] = useState(true)
  const [branchesExpanded, setBranchesExpanded] = useState(false)
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<ConflictFile[]>([])
  const [conflictsExpanded, setConflictsExpanded] = useState(true)
  const [loadingConflicts, setLoadingConflicts] = useState(false)
  const [stashes, setStashes] = useState<Array<{
    index: number
    message: string
    branch: string
    date: string
  }>>([])
  const [stashMessage, setStashMessage] = useState('')
  const [showStashDialog, setShowStashDialog] = useState(false)
  const [stashesExpanded, setStashesExpanded] = useState(false)

  const projectPath = settings.projectPath

  const fetchStatus = useCallback(async () => {
    if (!projectPath) {
      setStatus(null)
      setLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(projectPath)}`)
      if (!res.ok) throw new Error('Failed to fetch status')
      const data: GitStatus = await res.json()
      setStatus(data)
    } catch (error) {
      toast.error('Failed to fetch git status')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  const fetchConflicts = useCallback(async () => {
    if (!projectPath) {
      setConflicts([])
      return
    }

    setLoadingConflicts(true)
    try {
      const res = await fetch(`/api/git/conflicts?path=${encodeURIComponent(projectPath)}`)
      if (!res.ok) throw new Error('Failed to fetch conflicts')
      const data = await res.json()
      setConflicts(data.conflicts || [])
    } catch {
      setConflicts([])
    } finally {
      setLoadingConflicts(false)
    }
  }, [projectPath])

  const fetchStashes = useCallback(async () => {
    if (!projectPath) {
      setStashes([])
      return
    }

    try {
      const res = await fetch(`/api/git/stash?path=${encodeURIComponent(projectPath)}`)
      if (res.ok) {
        const data = await res.json()
        setStashes(data)
      }
    } catch (error) {
      console.error('Failed to fetch stashes:', error)
    }
  }, [projectPath])

  const createStash = useCallback(async () => {
    if (!projectPath) return

    try {
      const res = await fetch('/api/git/stash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: stashMessage, projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to stash')
      
      toast.success('Changes stashed')
      setStashMessage('')
      setShowStashDialog(false)
      fetchStashes()
      fetchStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stash changes')
    }
  }, [projectPath, stashMessage, fetchStashes, fetchStatus])

  const stashAction = useCallback(async (index: number, action: 'apply' | 'pop' | 'drop') => {
    if (!projectPath) return

    try {
      const res = await fetch(`/api/git/stash/${index}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action} stash`)
      
      toast.success(`Stash ${action} successful`)
      fetchStashes()
      fetchStatus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} stash`)
    }
  }, [projectPath, fetchStashes, fetchStatus])

  useEffect(() => {
    setLoading(true)
    fetchStatus()
    fetchBranches()
    fetchConflicts()
    fetchStashes()
  }, [fetchStatus, fetchBranches, fetchConflicts, fetchStashes])

  const fetchDiff = useCallback(async (file: GitFileStatus) => {
    if (!projectPath) return

    setLoadingDiff(true)
    try {
      const res = await fetch(
        `/api/git/diff?file=${encodeURIComponent(file.path)}&staged=${file.staged}&path=${encodeURIComponent(projectPath)}`
      )
      if (!res.ok) throw new Error('Failed to fetch diff')
      const data = await res.json()
      setDiff(data.diff || 'No changes')
    } catch {
      setDiff('Failed to load diff')
    } finally {
      setLoadingDiff(false)
    }
  }, [projectPath])

  const handleFileClick = useCallback((file: GitFileStatus) => {
    setSelectedFile(file)
    fetchDiff(file)
  }, [fetchDiff])

  const handleStage = useCallback(async (files: string[], action: 'stage' | 'unstage') => {
    if (!projectPath) return

    try {
      const res = await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, action, projectPath }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to stage/unstage')
      }
      await fetchStatus()
      toast.success(action === 'stage' ? 'Files staged' : 'Files unstaged')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operation failed')
    }
  }, [projectPath, fetchStatus])

  const handleStageAll = useCallback(async () => {
    if (!projectPath) return

    try {
      const res = await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stage-all', projectPath }),
      })
      if (!res.ok) throw new Error('Failed to stage all')
      await fetchStatus()
      toast.success('All files staged')
    } catch {
      toast.error('Failed to stage all files')
    }
  }, [projectPath, fetchStatus])

  const handleUnstageAll = useCallback(async () => {
    if (!projectPath) return

    try {
      const res = await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unstage-all', projectPath }),
      })
      if (!res.ok) throw new Error('Failed to unstage all')
      await fetchStatus()
      toast.success('All files unstaged')
    } catch {
      toast.error('Failed to unstage all files')
    }
  }, [projectPath, fetchStatus])

  const handleCommit = useCallback(async () => {
    if (!projectPath || !commitMessage.trim()) {
      toast.error('Please enter a commit message')
      return
    }

    setCommitting(true)
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMessage, projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to commit')
      
      setCommitMessage('')
      await fetchStatus()
      toast.success(`Committed: ${data.commitHash || 'success'}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to commit')
    } finally {
      setCommitting(false)
    }
  }, [projectPath, commitMessage, fetchStatus])

  const handlePush = useCallback(async () => {
    if (!projectPath) return

    setPushing(true)
    try {
      const res = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to push')
      
      await fetchStatus()
      toast.success('Pushed successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to push')
    } finally {
      setPushing(false)
    }
  }, [projectPath, fetchStatus])

  const handlePull = useCallback(async () => {
    if (!projectPath) return

    setPulling(true)
    try {
      const res = await fetch('/api/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to pull')
      
      await fetchStatus()
      toast.success('Pulled successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to pull')
    } finally {
      setPulling(false)
    }
  }, [projectPath, fetchStatus])

  const handleDiscard = useCallback(async (files: string[]) => {
    if (!projectPath) return

    try {
      const res = await fetch('/api/git/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, projectPath }),
      })
      if (!res.ok) throw new Error('Failed to discard changes')
      
      await fetchStatus()
      setSelectedFile(null)
      setDiff('')
      toast.success('Changes discarded')
    } catch {
      toast.error('Failed to discard changes')
    }
  }, [projectPath, fetchStatus])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    )
  }

  if (!projectPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <AlertCircle className="h-8 w-8 text-muted" />
        <p className="text-sm text-muted">No project folder open</p>
        <p className="text-xs text-muted">Open a folder to use source control</p>
      </div>
    )
  }

  if (!status?.isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <GitBranch className="h-8 w-8 text-muted" />
        <p className="text-sm text-muted">Not a git repository</p>
        <p className="text-xs text-muted">Initialize a git repository to use source control</p>
      </div>
    )
  }

  const stagedFiles = status.files.filter((f) => f.staged)
  const unstagedFiles = status.files.filter((f) => !f.staged)

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) {
      toast.error('Branch name is required')
      return
    }
    await createBranch(newBranchName.trim(), true)
    setNewBranchName('')
    setShowNewBranchDialog(false)
  }

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return
    await deleteBranch(branchToDelete, false)
    setBranchToDelete(null)
  }

  const localBranches = branches.filter((b) => !b.isRemote)
  const remoteBranches = branches.filter((b) => b.isRemote)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-7 gap-1.5 px-2 text-sm font-medium">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="max-w-[120px] truncate">{currentBranch || status.branch}</span>
              {(status.ahead > 0 || status.behind > 0) && (
                <span className="text-xs text-muted">
                  {status.ahead > 0 && `↑${status.ahead}`}
                  {status.behind > 0 && `↓${status.behind}`}
                </span>
              )}
              <ChevronDown className="h-3 w-3 text-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {branchesLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : (
              <>
                {localBranches.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted">Local Branches</div>
                    {localBranches.map((branch) => (
                      <DropdownMenuItem
                        key={branch.name}
                        className="flex items-center justify-between"
                        onClick={() => {
                          if (branch.name !== currentBranch) {
                            checkoutBranch(branch.name)
                          }
                        }}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {branch.name === currentBranch && (
                            <Check className="h-3 w-3 text-green-500" />
                          )}
                          <span className={cn(branch.name === currentBranch && 'font-medium')}>
                            {branch.name}
                          </span>
                        </span>
                        {branch.name !== currentBranch && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              setBranchToDelete(branch.name)
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                {remoteBranches.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted">Remote Branches</div>
                    {remoteBranches.slice(0, 10).map((branch) => (
                      <DropdownMenuItem
                        key={branch.name}
                        onClick={() => checkoutBranch(branch.name)}
                      >
                        <span className="truncate text-muted">{branch.name}</span>
                      </DropdownMenuItem>
                    ))}
                    {remoteBranches.length > 10 && (
                      <div className="px-2 py-1 text-xs text-muted">
                        +{remoteBranches.length - 10} more
                      </div>
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowNewBranchDialog(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  New Branch
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => fetchBranches()}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Refresh Branches
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              fetchStatus()
              fetchBranches()
              fetchConflicts()
              fetchStashes()
            }}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handlePull}
          disabled={pulling}
        >
          {pulling ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Pull
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handlePush}
          disabled={pushing || status.ahead === 0}
        >
          {pushing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          Push
          {status.ahead > 0 && (
            <span className="ml-0.5 rounded bg-primary/20 px-1 text-[10px]">
              {status.ahead}
            </span>
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Merge Conflicts Section */}
          {conflicts.length > 0 && (
            <div className="mb-3 rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-2">
              <button
                className="flex w-full items-center gap-1 py-1 text-xs font-medium text-yellow-500 hover:text-yellow-400"
                onClick={() => setConflictsExpanded(!conflictsExpanded)}
              >
                {conflictsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <AlertTriangle className="h-3.5 w-3.5" />
                Merge Conflicts
                <span className="ml-auto rounded bg-yellow-500/20 px-1.5 text-[10px] text-yellow-500">
                  {conflicts.length}
                </span>
              </button>
              {conflictsExpanded && (
                <div className="mt-2">
                  {loadingConflicts ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                    </div>
                  ) : (
                    <ConflictList
                      conflicts={conflicts}
                      projectPath={projectPath}
                      onConflictResolved={() => {
                        fetchStatus()
                        fetchConflicts()
                      }}
                    />
                  )}
                  <p className="mt-2 text-[10px] text-muted">
                    Resolve all conflicts before committing
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mb-3">
            <Textarea
              placeholder="Commit message"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="min-h-[60px] resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleCommit()
                }
              }}
            />
            <Button
              className="mt-2 w-full gap-1.5"
              size="sm"
              onClick={handleCommit}
              disabled={committing || stagedFiles.length === 0 || !commitMessage.trim() || conflicts.length > 0}
            >
              {committing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitCommit className="h-3.5 w-3.5" />
              )}
              Commit
              {conflicts.length > 0 && (
                <span className="text-[10px] text-yellow-500">(resolve conflicts first)</span>
              )}
            </Button>
          </div>

          <div className="mb-2">
            <button
              className="flex w-full items-center gap-1 py-1 text-xs font-medium text-muted hover:text-foreground"
              onClick={() => setStagedExpanded(!stagedExpanded)}
            >
              {stagedExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Staged Changes
              <span className="ml-auto rounded bg-green-500/20 px-1.5 text-[10px] text-green-500">
                {stagedFiles.length}
              </span>
              {stagedFiles.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-5 w-5"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUnstageAll()
                  }}
                  title="Unstage all"
                >
                  <Minus className="h-3 w-3" />
                </Button>
              )}
            </button>
            {stagedExpanded && stagedFiles.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {stagedFiles.map((file) => (
                  <FileItem
                    key={`staged-${file.path}`}
                    file={file}
                    selected={selectedFile?.path === file.path && selectedFile?.staged}
                    onClick={() => handleFileClick(file)}
                    onStage={() => handleStage([file.path], 'unstage')}
                    onDiscard={() => handleDiscard([file.path])}
                    staged
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              className="flex w-full items-center gap-1 py-1 text-xs font-medium text-muted hover:text-foreground"
              onClick={() => setChangesExpanded(!changesExpanded)}
            >
              {changesExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Changes
              <span className="ml-auto rounded bg-yellow-500/20 px-1.5 text-[10px] text-yellow-500">
                {unstagedFiles.length}
              </span>
              {unstagedFiles.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-5 w-5"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStageAll()
                  }}
                  title="Stage all"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </button>
            {changesExpanded && unstagedFiles.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {unstagedFiles.map((file) => (
                  <FileItem
                    key={`unstaged-${file.path}`}
                    file={file}
                    selected={selectedFile?.path === file.path && !selectedFile?.staged}
                    onClick={() => handleFileClick(file)}
                    onStage={() => handleStage([file.path], 'stage')}
                    onDiscard={file.status !== 'untracked' ? () => handleDiscard([file.path]) : undefined}
                    staged={false}
                  />
                ))}
              </div>
            )}
          </div>

          {status.files.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Check className="h-8 w-8 text-green-500" />
              <p className="mt-2 text-sm text-muted">No changes</p>
              <p className="text-xs text-muted">Working tree clean</p>
            </div>
          )}

          {/* Stash Section */}
          <div className="mt-3 border-t border-border pt-3">
            <button
              className="flex w-full items-center gap-1 py-1 text-xs font-medium text-muted hover:text-foreground"
              onClick={() => setStashesExpanded(!stashesExpanded)}
            >
              {stashesExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Archive className="h-3.5 w-3.5" />
              Stashes
              {stashes.length > 0 && (
                <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
                  {stashes.length}
                </Badge>
              )}
            </button>
            {stashesExpanded && (
              <div className="mt-2 space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => setShowStashDialog(true)}
                  disabled={status.files.length === 0}
                >
                  <Plus className="h-3 w-3" />
                  Stash Changes
                </Button>

                {stashes.length === 0 ? (
                  <p className="text-center text-xs text-muted py-2">No stashes</p>
                ) : (
                  stashes.map((stash) => (
                    <div
                      key={stash.index}
                      className="flex items-center justify-between rounded border border-border p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{stash.message}</p>
                        <p className="text-[10px] text-muted truncate">
                          {stash.branch}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => stashAction(stash.index, 'apply')}>
                            Apply
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => stashAction(stash.index, 'pop')}>
                            Pop
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => stashAction(stash.index, 'drop')}
                            className="text-destructive focus:text-destructive"
                          >
                            Drop
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {selectedFile && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium truncate max-w-[200px]">
                {selectedFile.path}
              </span>
              <span className={cn('text-xs font-mono', STATUS_COLORS[selectedFile.status])}>
                {STATUS_ICONS[selectedFile.status]}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setSelectedFile(null)
                setDiff('')
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="h-[200px]">
            {loadingDiff ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : (
              <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">
                {diff.split('\n').map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      line.startsWith('+') && !line.startsWith('+++') && 'bg-green-500/10 text-green-500',
                      line.startsWith('-') && !line.startsWith('---') && 'bg-red-500/10 text-red-500',
                      line.startsWith('@@') && 'text-blue-500',
                      line.startsWith('diff') && 'text-muted font-bold'
                    )}
                  >
                    {line}
                  </div>
                ))}
              </pre>
            )}
          </ScrollArea>
        </div>
      )}

      {/* New Branch Dialog */}
      <Dialog open={showNewBranchDialog} onOpenChange={setShowNewBranchDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Branch name (e.g., feature/my-feature)"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateBranch()
                }
              }}
              autoFocus
            />
            <p className="mt-2 text-xs text-muted">
              Branch will be created from: <span className="font-medium">{currentBranch}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBranchDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Branch Confirmation */}
      <AlertDialog open={!!branchToDelete} onOpenChange={() => setBranchToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the branch &quot;{branchToDelete}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBranch}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Branch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stash Dialog */}
      <Dialog open={showStashDialog} onOpenChange={setShowStashDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Stash Changes</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Stash message (optional)"
              value={stashMessage}
              onChange={(e) => setStashMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createStash()
                }
              }}
              autoFocus
            />
            <p className="mt-2 text-xs text-muted">
              This will stash all uncommitted changes in your working directory.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStashDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createStash}>
              <Archive className="mr-2 h-4 w-4" />
              Stash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface FileItemProps {
  file: GitFileStatus
  selected: boolean
  onClick: () => void
  onStage: () => void
  onDiscard?: () => void
  staged: boolean
}

function FileItem({ file, selected, onClick, onStage, onDiscard, staged }: FileItemProps) {
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.includes('/') 
    ? file.path.slice(0, file.path.lastIndexOf('/'))
    : ''

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded px-2 py-1 text-xs cursor-pointer',
        selected ? 'bg-primary/10' : 'hover:bg-card/80'
      )}
      onClick={onClick}
    >
      <span className={cn('font-mono w-4 text-center', STATUS_COLORS[file.status])}>
        {STATUS_ICONS[file.status]}
      </span>
      <span className="flex-1 truncate">
        <span className="text-foreground">{fileName}</span>
        {dirPath && (
          <span className="text-muted ml-1">{dirPath}</span>
        )}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e) => {
            e.stopPropagation()
            onStage()
          }}
          title={staged ? 'Unstage' : 'Stage'}
        >
          {staged ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </Button>
        {onDiscard && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDiscard()
            }}
            title="Discard changes"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
