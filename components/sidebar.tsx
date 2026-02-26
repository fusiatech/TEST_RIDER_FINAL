'use client'

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
} from 'lucide-react'

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
  const sessions = useSwarmStore((s) => s.sessions)
  const currentSessionId = useSwarmStore((s) => s.currentSessionId)
  const sidebarOpen = useSwarmStore((s) => s.sidebarOpen)
  const settings = useSwarmStore((s) => s.settings)
  const createSession = useSwarmStore((s) => s.createSession)
  const switchSession = useSwarmStore((s) => s.switchSession)
  const deleteSession = useSwarmStore((s) => s.deleteSession)
  const toggleSidebar = useSwarmStore((s) => s.toggleSidebar)
  const toggleSettings = useSwarmStore((s) => s.toggleSettings)
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

  const enabledCLIs = CLI_REGISTRY.filter((cli) =>
    settings.enabledCLIs.includes(cli.id)
  )

  const isProjectMode = mode === 'project'

  const jobCount = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length
  const enabledTaskCount = scheduledTasks.filter((t) => t.enabled).length

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
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1 py-1">
            {isProjectMode ? (
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
                        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`Delete project "${project.name}"`}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteProject(project.id)
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
            ) : sessionsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))
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
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Delete chat "${session.title}"`}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(session.id)
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
          <div className="flex items-center gap-1.5 px-1">
            {enabledCLIs.map((cli) => (
              <div
                key={cli.id}
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: cli.installed !== false ? '#22c55e' : '#ef4444',
                }}
                title={`${cli.name}${cli.installed !== false ? ' (detected)' : ' (not found)'}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 px-1">
            <Button
              variant={activePanel === 'queue' ? 'default' : 'ghost'}
              size="icon"
              className="relative h-8 w-8"
              onClick={() => setActivePanel('queue')}
              title="Job Queue"
            >
              <ListTodo className="h-4 w-4" />
              {jobCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-background">
                  {jobCount}
                </span>
              )}
            </Button>
            <Button
              variant={activePanel === 'schedule' ? 'default' : 'ghost'}
              size="icon"
              className="relative h-8 w-8"
              onClick={() => setActivePanel('schedule')}
              title="Scheduled Tasks"
            >
              <CalendarClock className="h-4 w-4" />
              {enabledTaskCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-background">
                  {enabledTaskCount}
                </span>
              )}
            </Button>
            <Button
              variant={activePanel === 'ideas' ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setActivePanel('ideas')}
              title="Idea Generator"
            >
              <Lightbulb className="h-4 w-4" />
            </Button>
          </div>

          <ThemeToggle />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted hover:text-foreground"
            onClick={toggleSettings}
            aria-label="Open settings"
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
    </>
  )
}
