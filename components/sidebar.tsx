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
import { ThemeToggle } from '@/components/theme-toggle'
import { JobQueue } from '@/components/job-queue'
import { SchedulerPanel } from '@/components/scheduler-panel'
import { IdeationBot } from '@/components/ideation-bot'
import { PromptLibrary } from '@/components/prompt-library'
import { DestructiveActionDialog } from '@/components/destructive-action-dialog'
import { NotificationCenter } from '@/components/notification-center'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Plus,
  Trash2,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  MessageCircle,
  Zap,
  FolderKanban,
  ListTodo,
  CalendarClock,
  Lightbulb,
  Inbox,
  BookOpen,
  Gauge,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'

interface PendingDeletion {
  type: 'session' | 'project'
  id: string
  name: string
}

const MODE_OPTIONS: { value: AppMode; label: string; Icon: typeof MessageCircle }[] = [
  { value: 'chat', label: 'Chat', Icon: MessageCircle },
  { value: 'swarm', label: 'Swarm', Icon: Zap },
  { value: 'project', label: 'Project', Icon: FolderKanban },
]

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
  const sessionsLoading = useSwarmStore((s) => s.sessionsLoading)
  const projects = useSwarmStore((s) => s.projects)
  const currentProjectId = useSwarmStore((s) => s.currentProjectId)
  const switchProject = useSwarmStore((s) => s.switchProject)
  const deleteProject = useSwarmStore((s) => s.deleteProject)
  const jobs = useSwarmStore((s) => s.jobs)
  const scheduledTasks = useSwarmStore((s) => s.scheduledTasks)
  const activePanel = useSwarmStore((s) => s.activePanel)
  const setActivePanel = useSwarmStore((s) => s.setActivePanel)
  const hydrateSidebar = useSwarmStore((s) => s.hydrateSidebar)
  const contextTokensUsed = useSwarmStore((s) => s.contextTokensUsed)
  const contextWindowTokens = useSwarmStore((s) => s.contextWindowTokens)
  const contextTokenPercent = useSwarmStore((s) => s.contextTokenPercent)
  const contextCompactionStatus = useSwarmStore((s) => s.contextCompactionStatus)
  const lastContextCompactionAt = useSwarmStore((s) => s.lastContextCompactionAt)
  const contextCompactionCount = useSwarmStore((s) => s.contextCompactionCount)
  const tokenPressureEvents = useSwarmStore((s) => s.tokenPressureEvents)
  
  const [showPromptLibrary, setShowPromptLibrary] = useState(false)

  useEffect(() => {
    hydrateSidebar()
  }, [hydrateSidebar])

  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)

  const enabledCLIs = CLI_REGISTRY.filter((cli) =>
    settings.enabledCLIs.includes(cli.id)
  )

  const isProjectMode = mode === 'project'

  const jobCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length
  const enabledTaskCount = scheduledTasks.filter((t) => t.enabled).length
  const contextPercentRounded = Math.round(contextTokenPercent)
  const contextStatusTone =
    contextTokenPercent >= 95
      ? 'text-red-400 border-red-500/40 bg-red-500/10'
      : contextTokenPercent >= 85
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : contextTokenPercent >= 70
          ? 'text-yellow-300 border-yellow-500/40 bg-yellow-500/10'
          : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
  const lastCompactionLabel = lastContextCompactionAt
    ? new Date(lastContextCompactionAt).toLocaleTimeString()
    : 'Never'
  const contextTooltip = [
    'Codex Context',
    `Window: ${contextWindowTokens.toLocaleString()} tokens`,
    `Used: ${contextTokensUsed.toLocaleString()} (${contextPercentRounded}%)`,
    `Status: ${contextCompactionStatus}`,
    'Auto-compact: 70% warn · 85% soft · 95% hard',
    `Compactions: ${contextCompactionCount}`,
    `Pressure events: ${tokenPressureEvents}`,
    `Last compacted: ${lastCompactionLabel}`,
  ].join('\n')

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

  return (
    <>
      <aside
        className={cn(
          'relative flex h-screen flex-col overflow-hidden transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-0'
        )}
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-background) 92%, black)' }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-lg font-bold text-foreground">SwarmUI</span>
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

        <div className="px-3 pt-3 pb-1">
          <div className="flex rounded-lg border border-border bg-secondary/30 p-0.5">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                aria-label={`Switch to ${opt.label} mode`}
                aria-pressed={mode === opt.value}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all',
                  mode === opt.value
                    ? 'bg-primary text-background shadow-sm'
                    : 'text-muted hover:text-foreground'
                )}
                data-testid={`mode-${opt.value}`}
              >
                <opt.Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 py-2">
          {isProjectMode ? (
            <CreateProjectDialog />
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => createSession()}
              data-testid="new-session-button"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 py-1">
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
            ) : sessions.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="No chats yet"
                description="Start a new conversation"
                variant="compact"
                className="py-8"
              />
            ) : (
              sessions.map((session) => (
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
                    aria-label={`Delete chat "${session.title}"`}
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
          </div>
        </ScrollArea>

        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center gap-1.5 px-1" role="list" aria-label="CLI agent status">
            {enabledCLIs.map((cli) => (
              <div
                key={cli.id}
                role="listitem"
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: cli.installed !== false ? '#22c55e' : '#ef4444',
                }}
                title={`${cli.name}${cli.installed !== false ? ' (detected)' : ' (not found)'}`}
                aria-label={`${cli.name}: ${cli.installed !== false ? 'detected' : 'not found'}`}
              />
            ))}
          </div>

          <Tooltip content={contextTooltip} contentClassName="whitespace-pre-line max-w-sm" side="top">
            <button
              type="button"
              className={cn(
                'w-full rounded-md border px-2 py-1.5 text-left transition-colors',
                contextStatusTone
              )}
              aria-label={`Codex Context ${contextPercentRounded}% used, status ${contextCompactionStatus}`}
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <Gauge className="h-3.5 w-3.5" />
                  Codex Context
                </span>
                <span className="text-xs font-semibold">{contextPercentRounded}%</span>
              </div>
            </button>
          </Tooltip>

          <div className="flex items-center gap-1 px-1">
            <Button
              variant={activePanel === 'queue' ? 'default' : 'ghost'}
              size="icon"
              className="relative h-8 w-8"
              onClick={() => setActivePanel('queue')}
              aria-label={`Job Queue${jobCount > 0 ? ` (${jobCount} active)` : ''}`}
              title="Job Queue"
            >
              <ListTodo className="h-4 w-4" />
              {jobCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-background" aria-hidden="true">
                  {jobCount}
                </span>
              )}
            </Button>
            <Button
              variant={activePanel === 'schedule' ? 'default' : 'ghost'}
              size="icon"
              className="relative h-8 w-8"
              onClick={() => setActivePanel('schedule')}
              aria-label={`Scheduled Tasks${enabledTaskCount > 0 ? ` (${enabledTaskCount} enabled)` : ''}`}
              title="Scheduled Tasks"
            >
              <CalendarClock className="h-4 w-4" />
              {enabledTaskCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-background" aria-hidden="true">
                  {enabledTaskCount}
                </span>
              )}
            </Button>
            <Button
              variant={activePanel === 'ideas' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setActivePanel('ideas')}
              aria-label="Idea Generator"
              title="Idea Generator"
            >
              <Lightbulb className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowPromptLibrary(true)}
              aria-label="Prompt Library"
              title="Prompt Library"
            >
              <BookOpen className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1 px-1">
            <NotificationCenter />
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted hover:text-foreground"
            onClick={() => router.push('/settings')}
            aria-label="Open settings"
            data-testid="settings-button"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </aside>

      {activePanel === 'queue' && (
        <JobQueue onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'schedule' && (
        <SchedulerPanel onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'ideas' && (
        <IdeationBot onClose={() => setActivePanel(null)} />
      )}
      
      {showPromptLibrary && (
        <PromptLibrary onClose={() => setShowPromptLibrary(false)} />
      )}

      {!sidebarOpen && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="fixed left-2 top-3 z-40 h-8 w-8 text-muted hover:text-foreground"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}

      <DestructiveActionDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => !open && setPendingDeletion(null)}
        title={pendingDeletion?.type === 'session' ? 'Delete Chat?' : 'Delete Project?'}
        description={
          pendingDeletion?.type === 'session'
            ? `Are you sure you want to delete "${pendingDeletion?.name}"? This action cannot be undone and all messages in this chat will be permanently lost.`
            : `Are you sure you want to delete project "${pendingDeletion?.name}"? This action cannot be undone and all project data including tickets will be permanently lost.`
        }
        actionLabel="Delete"
        cancelLabel="Keep it"
        onConfirm={confirmDeletion}
      />
    </>
  )
}
