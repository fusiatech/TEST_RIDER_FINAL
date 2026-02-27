'use client'

import { useState, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
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
  DialogDescription,
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
import {
  FolderOpen,
  ChevronDown,
  Plus,
  Trash2,
  Check,
  Loader2,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function WorkspaceSwitcher() {
  const workspaces = useSwarmStore((s) => s.workspaces)
  const currentWorkspaceId = useSwarmStore((s) => s.currentWorkspaceId)
  const workspacesLoading = useSwarmStore((s) => s.workspacesLoading)
  const loadWorkspaces = useSwarmStore((s) => s.loadWorkspaces)
  const createWorkspace = useSwarmStore((s) => s.createWorkspace)
  const switchWorkspace = useSwarmStore((s) => s.switchWorkspace)
  const deleteWorkspace = useSwarmStore((s) => s.deleteWorkspace)
  const settings = useSwarmStore((s) => s.settings)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspacePath, setNewWorkspacePath] = useState('')
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId)

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim() || !newWorkspacePath.trim()) {
      return
    }
    setCreating(true)
    try {
      await createWorkspace(newWorkspaceName.trim(), newWorkspacePath.trim())
      setNewWorkspaceName('')
      setNewWorkspacePath('')
      setShowCreateDialog(false)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteWorkspace = async () => {
    if (!workspaceToDelete) return
    await deleteWorkspace(workspaceToDelete)
    setWorkspaceToDelete(null)
  }

  const formatLastOpened = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const sortedWorkspaces = [...workspaces].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
  )

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between gap-2">
            <FolderOpen className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">
              {currentWorkspace?.name || settings.projectPath?.split(/[/\\]/).pop() || 'Select Workspace'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {workspacesLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            </div>
          ) : (
            <>
              {sortedWorkspaces.length > 0 ? (
                <>
                  {sortedWorkspaces.map((workspace) => (
                    <DropdownMenuItem
                      key={workspace.id}
                      className="flex items-center justify-between group"
                      onClick={() => {
                        if (workspace.id !== currentWorkspaceId) {
                          switchWorkspace(workspace.id)
                        }
                      }}
                    >
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          {workspace.id === currentWorkspaceId && (
                            <Check className="h-3 w-3 text-green-500 shrink-0" />
                          )}
                          <span
                            className={cn(
                              'truncate',
                              workspace.id === currentWorkspaceId && 'font-medium'
                            )}
                          >
                            {workspace.name}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted truncate">
                          <Clock className="h-2.5 w-2.5" />
                          {formatLastOpened(workspace.lastOpenedAt)}
                        </span>
                      </div>
                      {workspace.id !== currentWorkspaceId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            setWorkspaceToDelete(workspace.id)
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              ) : (
                <div className="px-2 py-4 text-center text-xs text-muted">
                  No workspaces yet
                </div>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Workspace Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Add a new workspace to organize your projects
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="workspace-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="workspace-name"
                placeholder="My Project"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="workspace-path" className="text-sm font-medium">
                Path
              </label>
              <Input
                id="workspace-path"
                placeholder="C:\Projects\my-project or /home/user/projects/my-project"
                value={newWorkspacePath}
                onChange={(e) => setNewWorkspacePath(e.target.value)}
              />
              <p className="text-xs text-muted">
                Enter the full path to your project folder
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkspace}
              disabled={!newWorkspaceName.trim() || !newWorkspacePath.trim() || creating}
            >
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Workspace Confirmation */}
      <AlertDialog open={!!workspaceToDelete} onOpenChange={() => setWorkspaceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this workspace? This will only remove it from the
              list, not delete any files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorkspace}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
