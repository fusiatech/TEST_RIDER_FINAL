'use client'

import { useMemo, useState } from 'react'
import { useSwarmStore } from '@/lib/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NoDataState } from '@/components/ui/no-data-state'
import { cn } from '@/lib/utils'
import { CheckCircle2, ListTodo, X, FolderKanban, AlertTriangle, ArrowRight } from 'lucide-react'

type TaskFilter = 'open' | 'blocked' | 'done'
type TaskView = 'project' | 'all'

interface TaskItem {
  projectId: string
  projectName: string
  id: string
  title: string
  status: string
  blocked: boolean
  done: boolean
}

function normalizeTitle(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : 'Untitled task'
}

export function TodoPanel({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [view, setView] = useState<TaskView>('project')

  const projects = useSwarmStore((s) => s.projects)
  const currentProjectId = useSwarmStore((s) => s.currentProjectId)
  const switchProject = useSwarmStore((s) => s.switchProject)
  const setMode = useSwarmStore((s) => s.setMode)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)

  const tasks = useMemo(() => {
    const out: TaskItem[] = []
    for (const project of projects) {
      for (const ticket of project.tickets) {
        const isTaskLevel = ticket.level === 'task' || ticket.level === 'subtask' || ticket.level === 'subatomic'
        if (!isTaskLevel) continue
        const done = ticket.status === 'done' || ticket.status === 'approved'
        const blocked = Array.isArray(ticket.blockedBy) && ticket.blockedBy.length > 0
        out.push({
          projectId: project.id,
          projectName: project.name,
          id: ticket.id,
          title: normalizeTitle(ticket.title),
          status: ticket.status,
          blocked,
          done,
        })
      }
    }
    return out
  }, [projects])

  const filteredTasks = useMemo(() => {
    if (filter === 'done') return tasks.filter((task) => task.done)
    if (filter === 'blocked') return tasks.filter((task) => task.blocked && !task.done)
    return tasks.filter((task) => !task.done)
  }, [tasks, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, TaskItem[]>()
    for (const task of filteredTasks) {
      const key = task.projectId
      const list = map.get(key) ?? []
      list.push(task)
      map.set(key, list)
    }
    return map
  }, [filteredTasks])

  const counts = useMemo(() => {
    const open = tasks.filter((task) => !task.done).length
    const blocked = tasks.filter((task) => task.blocked && !task.done).length
    const done = tasks.filter((task) => task.done).length
    return { open, blocked, done, total: tasks.length }
  }, [tasks])

  const openProjectFromTask = (projectId: string) => {
    switchProject(projectId)
    setMode('project')
    setActiveTab('chat')
    onClose()
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
          <Badge variant="secondary" className="text-[10px]">
            {counts.total}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close tasks panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 border-b border-border px-4 py-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            className={cn(
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              view === 'project' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            )}
            onClick={() => setView('project')}
          >
            By Project
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-2.5 py-1 text-xs transition-colors',
              view === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            )}
            onClick={() => setView('all')}
          >
            All Tasks
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => setFilter('open')}
            className={cn(
              'rounded-md border px-2 py-1 text-left text-xs transition-colors',
              filter === 'open' ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted hover:text-foreground'
            )}
          >
            Open ({counts.open})
          </button>
          <button
            type="button"
            onClick={() => setFilter('blocked')}
            className={cn(
              'rounded-md border px-2 py-1 text-left text-xs transition-colors',
              filter === 'blocked' ? 'border-amber-500/40 bg-amber-500/10 text-foreground' : 'border-border text-muted hover:text-foreground'
            )}
          >
            Blocked ({counts.blocked})
          </button>
          <button
            type="button"
            onClick={() => setFilter('done')}
            className={cn(
              'rounded-md border px-2 py-1 text-left text-xs transition-colors',
              filter === 'done' ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground' : 'border-border text-muted hover:text-foreground'
            )}
          >
            Done ({counts.done})
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {filteredTasks.length === 0 ? (
          <NoDataState
            title="No tasks in this view"
            description="Switch filter or project grouping to inspect other tasks."
            className="min-h-[240px]"
          />
        ) : view === 'all' ? (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-border bg-card/60 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{task.title}</span>
                  {task.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : task.blocked ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : null}
                </div>
                <p className="text-xs text-muted">{task.projectName}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {task.status.replaceAll('_', ' ')}
                  </Badge>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openProjectFromTask(task.projectId)}>
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {projects
              .filter((project) => grouped.has(project.id))
              .map((project) => {
                const projectTasks = grouped.get(project.id) ?? []
                const openCount = projectTasks.filter((task) => !task.done).length
                return (
                  <section
                    key={project.id}
                    className={cn(
                      'rounded-xl border border-border bg-card/60 p-3',
                      project.id === currentProjectId && 'border-primary/40'
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {openCount}/{projectTasks.length} open
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {projectTasks.slice(0, 8).map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1.5">
                          <span className="truncate text-xs text-foreground">{task.title}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {task.status.replaceAll('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                      {projectTasks.length > 8 && (
                        <p className="text-[11px] text-muted">+{projectTasks.length - 8} more tasks</p>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs" onClick={() => openProjectFromTask(project.id)}>
                      Open project task flow
                    </Button>
                  </section>
                )
              })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
