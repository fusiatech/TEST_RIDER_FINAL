'use client'

import { useState, useMemo, useCallback } from 'react'
import type { Epic, Ticket, EpicStatus } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface EpicManagerProps {
  projectId: string
  epics: Epic[]
  tickets: Ticket[]
  onCreateEpic: (epic: Omit<Epic, 'id' | 'projectId' | 'progress' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onUpdateEpic: (epicId: string, update: Partial<Epic>) => Promise<void>
  onDeleteEpic: (epicId: string) => Promise<void>
  onAssignTicket: (ticketId: string, epicId: string | undefined) => Promise<void>
}

const STATUS_COLORS: Record<EpicStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' },
  active: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  completed: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
}

const TICKET_STATUS_COLORS: Record<string, string> = {
  backlog: '#71717a',
  in_progress: '#3b82f6',
  review: '#eab308',
  done: '#22c55e',
  approved: '#22c55e',
  rejected: '#ef4444',
}

function ProgressBar({ progress, status }: { progress: number; status: EpicStatus }) {
  const color = status === 'completed' ? '#22c55e' : status === 'active' ? '#3b82f6' : '#71717a'
  return (
    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${progress}%`, backgroundColor: color }}
      />
    </div>
  )
}

function EpicCard({
  epic,
  tickets,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onTicketDrop,
  onRemoveTicket,
}: {
  epic: Epic
  tickets: Ticket[]
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onTicketDrop: (ticketId: string) => void
  onRemoveTicket: (ticketId: string) => void
}) {
  const epicTickets = tickets.filter((t) => epic.ticketIds.includes(t.id))
  const doneCount = epicTickets.filter((t) => t.status === 'done' || t.status === 'approved').length
  const statusColors = STATUS_COLORS[epic.status]

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('ring-2', 'ring-primary')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('ring-2', 'ring-primary')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('ring-2', 'ring-primary')
    const ticketId = e.dataTransfer.getData('ticketId')
    if (ticketId) {
      onTicketDrop(ticketId)
    }
  }

  return (
    <Card
      className={cn('border-border transition-all', expanded && 'ring-1 ring-primary/20')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onToggle}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-sm font-medium truncate">{epic.title}</CardTitle>
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1.5 shrink-0', statusColors.text, statusColors.border)}
            >
              {epic.status}
            </Badge>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-muted mr-2">
              {doneCount}/{epicTickets.length} tickets
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-400 hover:text-red-300"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Progress</span>
            <span>{epic.progress}%</span>
          </div>
          <ProgressBar progress={epic.progress} status={epic.status} />
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-2">
          {epic.description && (
            <p className="text-xs text-muted mb-3">{epic.description}</p>
          )}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted mb-2">Assigned Tickets</div>
            {epicTickets.length === 0 ? (
              <div className="flex items-center justify-center h-16 rounded-lg border border-dashed border-border">
                <span className="text-xs text-muted">Drop tickets here to assign</span>
              </div>
            ) : (
              <div className="space-y-1">
                {epicTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center justify-between p-2 rounded-md bg-card/50 border border-border"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: TICKET_STATUS_COLORS[ticket.status] }}
                      />
                      <span className="text-xs truncate">{ticket.title}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => onRemoveTicket(ticket.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function UnassignedTickets({
  tickets,
  onDragStart,
}: {
  tickets: Ticket[]
  onDragStart: (ticketId: string) => void
}) {
  const unassigned = tickets.filter((t) => !t.epicId)

  if (unassigned.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center justify-center h-20 text-xs text-muted">
          All tickets are assigned to epics
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          Unassigned Tickets
          <Badge variant="secondary" className="text-[10px]">
            {unassigned.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {unassigned.map((ticket) => (
          <div
            key={ticket.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('ticketId', ticket.id)
              onDragStart(ticket.id)
            }}
            className="flex items-center gap-2 p-2 rounded-md bg-card/50 border border-border cursor-grab hover:border-primary/30 transition-colors"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted shrink-0" />
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: TICKET_STATUS_COLORS[ticket.status] }}
            />
            <span className="text-xs truncate">{ticket.title}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function EpicManager({
  projectId,
  epics,
  tickets,
  onCreateEpic,
  onUpdateEpic,
  onDeleteEpic,
  onAssignTicket,
}: EpicManagerProps) {
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEpic, setEditingEpic] = useState<Epic | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formStatus, setFormStatus] = useState<EpicStatus>('draft')
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const total = epics.length
    const active = epics.filter((e) => e.status === 'active').length
    const completed = epics.filter((e) => e.status === 'completed').length
    const avgProgress = total > 0 ? Math.round(epics.reduce((sum, e) => sum + e.progress, 0) / total) : 0
    return { total, active, completed, avgProgress }
  }, [epics])

  const toggleExpanded = useCallback((epicId: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev)
      if (next.has(epicId)) {
        next.delete(epicId)
      } else {
        next.add(epicId)
      }
      return next
    })
  }, [])

  const openCreateDialog = () => {
    setEditingEpic(null)
    setFormTitle('')
    setFormDescription('')
    setFormStatus('draft')
    setDialogOpen(true)
  }

  const openEditDialog = (epic: Epic) => {
    setEditingEpic(epic)
    setFormTitle(epic.title)
    setFormDescription(epic.description)
    setFormStatus(epic.status)
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formTitle.trim()) return

    if (editingEpic) {
      await onUpdateEpic(editingEpic.id, {
        title: formTitle,
        description: formDescription,
        status: formStatus,
      })
    } else {
      await onCreateEpic({
        title: formTitle,
        description: formDescription,
        ticketIds: [],
        status: formStatus,
      })
    }
    setDialogOpen(false)
  }

  const handleTicketDrop = async (epicId: string, ticketId: string) => {
    await onAssignTicket(ticketId, epicId)
    setDraggedTicketId(null)
  }

  const handleRemoveTicket = async (ticketId: string) => {
    await onAssignTicket(ticketId, undefined)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Epics</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              {stats.active} active
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {stats.completed} completed
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {stats.avgProgress}% avg
            </span>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          New Epic
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {epics.length === 0 ? (
            <Card className="border-border">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="h-10 w-10 text-muted mb-3" />
                <h4 className="text-sm font-medium text-foreground">No epics yet</h4>
                <p className="text-xs text-muted mt-1">
                  Create epics to group related tickets and track progress
                </p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                  Create First Epic
                </Button>
              </CardContent>
            </Card>
          ) : (
            epics.map((epic) => (
              <EpicCard
                key={epic.id}
                epic={epic}
                tickets={tickets}
                expanded={expandedEpics.has(epic.id)}
                onToggle={() => toggleExpanded(epic.id)}
                onEdit={() => openEditDialog(epic)}
                onDelete={() => onDeleteEpic(epic.id)}
                onTicketDrop={(ticketId) => handleTicketDrop(epic.id, ticketId)}
                onRemoveTicket={handleRemoveTicket}
              />
            ))
          )}
        </div>

        <div>
          <UnassignedTickets
            tickets={tickets}
            onDragStart={setDraggedTicketId}
          />
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEpic ? 'Edit Epic' : 'Create Epic'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Epic title..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormDescription(e.target.value)}
                placeholder="Describe this epic..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={formStatus} onValueChange={(v: string) => setFormStatus(v as EpicStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formTitle.trim()}>
              {editingEpic ? 'Save Changes' : 'Create Epic'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
