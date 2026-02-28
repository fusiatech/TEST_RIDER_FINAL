'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSwarmStore } from '@/lib/store'
import type { AppMode } from '@/lib/store'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { CreateProjectDialog } from '@/components/create-project-dialog'
import { TodoPanel } from '@/components/todo-panel'
import { SchedulerPanel } from '@/components/scheduler-panel'
import { PromptLibrary } from '@/components/prompt-library'
import { DestructiveActionDialog } from '@/components/destructive-action-dialog'
import { SlidePanel } from '@/components/ui/slide-panel'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Trash2,
  Settings,
  PanelLeftClose,
  MessageSquare,
  MessageCircle,
  Zap,
  FolderKanban,
  LayoutDashboard,
  Code2,
  BarChart3,
  ListTodo,
  CalendarClock,
  Inbox,
  BookOpen,
  Play,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface PendingDeletion {
  type: 'session' | 'project'
  id: string
  name: string
}

const SURFACE_NAV = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'chat', label: 'Conversations', Icon: MessageCircle },
  { id: 'ide', label: 'IDE', Icon: Code2 },
  { id: 'observability', label: 'Observability', Icon: BarChart3 },
] as const

const STATUS_COLORS: Record<string, string> = {
  planning: '#a78bfa',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  archived: '#71717a',
}

export function Sidebar() {
  const router = useRouter()
  const sessions = useSwarmStore((s) => s.sessions)
  const currentSessionId = useSwarmStore((s) => s.currentSessionId)
  const sidebarOpen = useSwarmStore((s) => s.sidebarOpen)
  const settings = useSwarmStore((s) => s.settings)
  const createSession = useSwarmStore((s) => s.createSession)
  const switchSession = useSwarmStore((s) => s.switchSession)
  const deleteSession = useSwarmStore((s) => s.deleteSession)
  const toggleSidebar = useSwarmStore((s) => s.toggleSidebar)
  const mode = useSwarmStore((s) => s.mode)
  const setMode = useSwarmStore((s) => s.setMode)
  const activeTab = useSwarmStore((s) => s.activeTab)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const sessionsLoading = useSwarmStore((s) => s.sessionsLoading)
  const projects = useSwarmStore((s) => s.projects)
  const currentProjectId = useSwarmStore((s) => s.currentProjectId)
  const switchProject = useSwarmStore((s) => s.switchProject)
  const deleteProject = useSwarmStore((s) => s.deleteProject)
  const scheduledTasks = useSwarmStore((s) => s.scheduledTasks)
  const activePanel = useSwarmStore((s) => s.activePanel)
  const setActivePanel = useSwarmStore((s) => s.setActivePanel)
  const hydrateSidebar = useSwarmStore((s) => s.hydrateSidebar)

  const [showPromptLibrary, setShowPromptLibrary] = useState(false)
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)

  useEffect(() => {
    hydrateSidebar()
  }, [hydrateSidebar])

  const enabledCLIs = CLI_REGISTRY.filter((cli) => settings.enabledCLIs.includes(cli.id))
  const isProjectMode = mode === 'project'
  const sessionsForMode = sessions.filter((session) => (session.mode ?? 'chat') === mode)

  const taskCount = projects
    .flatMap((project) => project.tickets)
    .filter(
      (ticket) =>
        (ticket.level === 'task' || ticket.level === 'subtask' || ticket.level === 'subatomic') &&
        ticket.status !== 'done' &&
        ticket.status !== 'approved'
    ).length

  const enabledTaskCount = scheduledTasks.filter((t) => t.enabled).length

  const handleDeleteSession = useCallback((id: string, title: string) => {
    setPendingDeletion({ type: 'session', id, name: title })
  }, [])

  const handleDeleteProject = useCallback((id: string, name: string) => {
    setPendingDeletion({ type: 'project', id, name })
  }, [])

  const confirmDeletion = useCallback(() => {
    if (!pendingDeletion) return
    if (pendingDeletion.type === 'session') {
      deleteSession(pendingDeletion.id)
    } else {
      deleteProject(pendingDeletion.id)
    }
    setPendingDeletion(null)
  }, [pendingDeletion, deleteSession, deleteProject])

  const startConversation = useCallback(() => {
    setMode('chat')
    setActiveTab('chat')
    createSession()
  }, [setMode, setActiveTab, createSession])

  const startProject = useCallback(() => {
    setMode('project')
    setActiveTab('dashboard')
    setShowCreateProjectDialog(true)
  }, [setMode, setActiveTab])

  const runInCurrentContext = useCallback(() => {
    setMode('swarm')
    setActiveTab('chat')
    window.dispatchEvent(new CustomEvent('fusia:focus-composer'))
  }, [setMode, setActiveTab])

  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col overflow-hidden border-r border-border bg-background/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 md:static md:inset-auto md:z-10 md:shadow-none',
          sidebarOpen ? 'translate-x-0 md:w-72' : '-translate-x-full md:translate-x-0 md:w-0'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Workspace</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 shrink-0 text-muted hover:text-foreground"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-start gap-2 border-primary/25 bg-primary/5 hover:bg-primary/10"
                data-action-id="start-work-menu-trigger"
                data-testid="new-session-button"
              >
                <Plus className="h-4 w-4" />
                Start work
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[240px]">
              <DropdownMenuItem onClick={startConversation} data-action-id="start-work-new-conversation">
                <MessageCircle className="mr-2 h-4 w-4" />
                New conversation
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setMode('swarm')
                  setActiveTab('chat')
                  createSession()
                }}
                data-action-id="start-work-new-swarm-run"
              >
                <Zap className="mr-2 h-4 w-4" />
                New multi-agent run
              </DropdownMenuItem>
              <DropdownMenuItem onClick={startProject} data-action-id="start-work-new-project">
                <FolderKanban className="mr-2 h-4 w-4" />
                New project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={runInCurrentContext} data-action-id="start-work-new-run">
                <Play className="mr-2 h-4 w-4" />
                Run in current context
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="px-3 pb-2">
          <nav aria-label="Primary navigation" className="space-y-1">
            {SURFACE_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                  activeTab === item.id
                    ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_35%,transparent)]'
                    : 'text-muted hover:bg-secondary/70 hover:text-foreground'
                )}
                data-action-id={`rail-nav-${item.id}`}
                aria-label={`Open ${item.label}`}
              >
                <item.Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-3 py-1">
            <div className="px-1">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted">
                {isProjectMode ? 'Projects' : 'Conversations'}
              </p>
            </div>

            {isProjectMode ? (
              projects.length === 0 ? (
                <EmptyState
                  icon={<FolderKanban />}
                  title="No projects"
                  description="Create a project to get started"
                  variant="compact"
                  className="py-8"
                />
              ) : (
                projects.map((project) => {
                  const totalTickets = project.tickets.length
                  const doneCount = project.tickets.filter((t) => t.status === 'done' || t.status === 'approved').length
                  const completionPct = totalTickets > 0 ? Math.round((doneCount / totalTickets) * 100) : 0

                  return (
                    <div
                      key={project.id}
                      className={cn(
                        'group flex flex-col gap-1 rounded-md px-3 py-2 cursor-pointer sidebar-item-hover',
                        project.id === currentProjectId
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted hover:bg-secondary hover:text-foreground'
                      )}
                      onClick={() => switchProject(project.id)}
                    >
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate text-sm font-medium">{project.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          aria-label={`Delete project "${project.name}"`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteProject(project.id, project.name)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            color: STATUS_COLORS[project.status] ?? '#71717a',
                            borderColor: STATUS_COLORS[project.status] ?? '#71717a',
                          }}
                        >
                          {project.status.replace('_', ' ')}
                        </Badge>
                        {totalTickets > 0 && (
                          <>
                            <span className="text-[10px] text-muted">{completionPct}%</span>
                            <span className="text-[10px] text-muted">{totalTickets} tickets</span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )
            ) : sessionsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))
            ) : sessionsForMode.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="No conversations yet"
                description="Start a new conversation"
                variant="compact"
                className="py-8"
              />
            ) : (
              sessionsForMode.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer sidebar-item-hover',
                    session.id === currentSessionId
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted hover:bg-secondary hover:text-foreground'
                  )}
                  onClick={() => switchSession(session.id)}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{session.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Delete conversation "${session.title}"`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteSession(session.id, session.title)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}

            <div className="border-t border-border/70 px-1 pt-3">
              <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">Utilities</p>
              <div className="space-y-1">
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                    activePanel === 'todos'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted hover:bg-secondary/70 hover:text-foreground'
                  )}
                  onClick={() => setActivePanel('todos')}
                  data-action-id="rail-tasks"
                >
                  <span className="inline-flex items-center gap-2">
                    <ListTodo className="h-3.5 w-3.5" />
                    Tasks
                  </span>
                  <Badge variant="outline" className="h-5 min-w-5 px-1 text-[10px]">{taskCount}</Badge>
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                    activePanel === 'schedule'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted hover:bg-secondary/70 hover:text-foreground'
                  )}
                  onClick={() => setActivePanel('schedule')}
                  data-action-id="rail-schedule"
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Schedule
                  </span>
                  <Badge variant="outline" className="h-5 min-w-5 px-1 text-[10px]">{enabledTaskCount}</Badge>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-secondary/70 hover:text-foreground"
                  onClick={() => setShowPromptLibrary(true)}
                  data-action-id="rail-prompt-library"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Prompt Library
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-secondary/70 hover:text-foreground"
                  onClick={() => router.push('/settings')}
                  aria-label="Open settings"
                  data-action-id="rail-settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border p-3 space-y-2">
          <div className="rounded-md border border-border/70 bg-card/60 p-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Runtime connectors</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="list" aria-label="Runtime connector status">
              {enabledCLIs.length > 0 ? (
                enabledCLIs.map((cli) => {
                  const isInstalled = cli.installed !== false
                  return (
                    <div
                      key={cli.id}
                      role="listitem"
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[10px]',
                        isInstalled
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
                          : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                      )}
                      title={`${cli.name}${isInstalled ? ' runtime detected' : ' runtime not found'}`}
                      aria-label={`${cli.name}: ${isInstalled ? 'runtime detected' : 'runtime not found'}`}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isInstalled ? 'bg-emerald-400' : 'bg-rose-400'
                        )}
                      />
                      <span>{cli.name}</span>
                    </div>
                  )
                })
              ) : (
                <span className="text-[11px] text-muted">No runtime connectors enabled</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 px-1">
            <div className="rounded-md border border-border/70 bg-card/60 px-2 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Open</p>
              <p className="text-xs font-semibold text-foreground">{taskCount}</p>
            </div>
            <div className="rounded-md border border-border/70 bg-card/60 px-2 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted">Schedules</p>
              <p className="text-xs font-semibold text-foreground">{enabledTaskCount}</p>
            </div>
          </div>
        </div>
      </aside>

      <SlidePanel
        open={activePanel === 'todos'}
        onClose={() => setActivePanel(null)}
        ariaLabel="Tasks panel"
      >
        <TodoPanel onClose={() => setActivePanel(null)} />
      </SlidePanel>

      <SlidePanel
        open={activePanel === 'schedule'}
        onClose={() => setActivePanel(null)}
        ariaLabel="Schedule panel"
      >
        <SchedulerPanel onClose={() => setActivePanel(null)} />
      </SlidePanel>

      {showPromptLibrary && <PromptLibrary onClose={() => setShowPromptLibrary(false)} />}

      <CreateProjectDialog
        open={showCreateProjectDialog}
        onOpenChange={setShowCreateProjectDialog}
        hideTrigger
      />

      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-label="Close navigation drawer"
          onClick={toggleSidebar}
        />
      )}

      <DestructiveActionDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => !open && setPendingDeletion(null)}
        title={pendingDeletion?.type === 'session' ? 'Delete conversation?' : 'Delete project?'}
        description={
          pendingDeletion?.type === 'session'
            ? `Are you sure you want to delete "${pendingDeletion?.name}"? This action cannot be undone and all messages in this conversation will be permanently lost.`
            : `Are you sure you want to delete project "${pendingDeletion?.name}"? This action cannot be undone and all project data including tickets will be permanently lost.`
        }
        actionLabel="Delete"
        cancelLabel="Keep it"
        onConfirm={confirmDeletion}
      />
    </>
  )
}
