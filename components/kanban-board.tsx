'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Ticket, TicketStatus, KanbanColumn } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  GripVertical,
  Palette,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface KanbanBoardProps {
  tickets: Ticket[]
  columns?: KanbanColumn[]
  onTicketMove: (ticketId: string, newStatus: TicketStatus, newIndex: number) => void
  onTicketClick?: (ticket: Ticket) => void
  onColumnsChange?: (columns: KanbanColumn[]) => void
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', status: 'backlog', color: '#71717a' },
  { id: 'in_progress', title: 'In Progress', status: 'in_progress', color: '#3b82f6' },
  { id: 'review', title: 'Review', status: 'review', color: '#eab308' },
  { id: 'done', title: 'Done', status: 'done', color: '#22c55e' },
]

const COLUMN_COLORS = [
  { name: 'Zinc', value: '#71717a' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Indigo', value: '#6366f1' },
]

const COMPLEXITY_COLORS: Record<string, string> = {
  S: 'bg-green-500/20 text-green-400',
  M: 'bg-blue-500/20 text-blue-400',
  L: 'bg-yellow-500/20 text-yellow-400',
  XL: 'bg-red-500/20 text-red-400',
}

interface SortableTicketCardProps {
  ticket: Ticket
  columnColor: string
  onClick?: () => void
}

function SortableTicketCard({ ticket, columnColor, onClick }: SortableTicketCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border border-border bg-card p-3 shadow-sm transition-all',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary',
        !isDragging && 'hover:border-primary/30 hover:shadow-md'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: columnColor }}
            />
            <span className="text-xs text-muted truncate">{ticket.id.slice(0, 8)}</span>
          </div>
          <h4 className="text-sm font-medium text-foreground line-clamp-2 cursor-pointer hover:text-primary">
            {ticket.title}
          </h4>
          {ticket.description && (
            <p className="mt-1.5 text-xs text-muted line-clamp-2">{ticket.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1.5', COMPLEXITY_COLORS[ticket.complexity])}
            >
              {ticket.complexity}
            </Badge>
            {ticket.assignedRole && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {ticket.assignedRole}
              </Badge>
            )}
            {ticket.dependencies && ticket.dependencies.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 text-orange-400 border-orange-400/30">
                {ticket.dependencies.length} deps
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TicketCardOverlay({ ticket, columnColor }: { ticket: Ticket; columnColor: string }) {
  return (
    <div className="rounded-lg border border-primary bg-card p-3 shadow-xl ring-2 ring-primary">
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 mt-0.5 text-muted" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: columnColor }}
            />
            <span className="text-xs text-muted truncate">{ticket.id.slice(0, 8)}</span>
          </div>
          <h4 className="text-sm font-medium text-foreground line-clamp-2">{ticket.title}</h4>
        </div>
      </div>
    </div>
  )
}

interface KanbanColumnProps {
  column: KanbanColumn
  tickets: Ticket[]
  onTicketClick?: (ticket: Ticket) => void
  onEditColumn: () => void
  onDeleteColumn: () => void
  onColorChange: (color: string) => void
}

function KanbanColumnComponent({
  column,
  tickets,
  onTicketClick,
  onEditColumn,
  onDeleteColumn,
  onColorChange,
}: KanbanColumnProps) {
  const ticketIds = useMemo(() => tickets.map((t) => t.id), [tickets])

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="font-semibold text-sm">{column.title}</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5">
            {tickets.length}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEditColumn}>
              <Edit2 className="h-4 w-4 mr-2" />
              Rename Column
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <span className="text-xs text-muted flex items-center gap-1 mb-2">
                <Palette className="h-3 w-3" />
                Column Color
              </span>
              <div className="grid grid-cols-5 gap-1">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={cn(
                      'h-5 w-5 rounded-full transition-all hover:scale-110',
                      column.color === c.value && 'ring-2 ring-offset-2 ring-offset-background ring-primary'
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => onColorChange(c.value)}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDeleteColumn}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1 rounded-lg bg-secondary/30 p-2 min-h-[200px]">
        <SortableContext items={ticketIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <SortableTicketCard
                key={ticket.id}
                ticket={ticket}
                columnColor={column.color}
                onClick={() => onTicketClick?.(ticket)}
              />
            ))}
            {tickets.length === 0 && (
              <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border">
                <span className="text-xs text-muted">Drop tickets here</span>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

export function KanbanBoard({
  tickets,
  columns: initialColumns,
  onTicketMove,
  onTicketClick,
  onColumnsChange,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>(initialColumns ?? DEFAULT_COLUMNS)
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | null>(null)
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')
  const [addColumnDialogOpen, setAddColumnDialogOpen] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnColor, setNewColumnColor] = useState(COLUMN_COLORS[0].value)
  const [newColumnStatus, setNewColumnStatus] = useState<TicketStatus>('backlog')

  const ticketsByColumn = useMemo(() => {
    const map = new Map<string, Ticket[]>()
    columns.forEach((col) => {
      map.set(col.id, tickets.filter((t) => t.status === col.status))
    })
    return map
  }, [tickets, columns])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const findColumnByTicketId = useCallback(
    (ticketId: string): KanbanColumn | undefined => {
      for (const [columnId, columnTickets] of ticketsByColumn.entries()) {
        if (columnTickets.some((t) => t.id === ticketId)) {
          return columns.find((c) => c.id === columnId)
        }
      }
      return undefined
    },
    [ticketsByColumn, columns]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const ticket = tickets.find((t) => t.id === active.id)
    if (ticket) {
      setActiveTicket(ticket)
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeColumn = findColumnByTicketId(activeId)
    const overColumn = columns.find((c) => c.id === overId) ?? findColumnByTicketId(overId)

    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id) {
      return
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTicket(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeColumn = findColumnByTicketId(activeId)
    let overColumn = columns.find((c) => c.id === overId)

    if (!overColumn) {
      overColumn = findColumnByTicketId(overId)
    }

    if (!activeColumn || !overColumn) return

    const activeTickets = ticketsByColumn.get(activeColumn.id) ?? []
    const overTickets = ticketsByColumn.get(overColumn.id) ?? []

    if (activeColumn.id === overColumn.id) {
      const oldIndex = activeTickets.findIndex((t) => t.id === activeId)
      const newIndex = activeTickets.findIndex((t) => t.id === overId)

      if (oldIndex !== newIndex && oldIndex !== -1 && newIndex !== -1) {
        onTicketMove(activeId, activeColumn.status, newIndex)
      }
    } else {
      const overIndex = overTickets.findIndex((t) => t.id === overId)
      const newIndex = overIndex === -1 ? overTickets.length : overIndex

      onTicketMove(activeId, overColumn.status, newIndex)
    }
  }

  const handleEditColumn = (column: KanbanColumn) => {
    setEditingColumn(column)
    setNewColumnTitle(column.title)
    setColumnDialogOpen(true)
  }

  const handleSaveColumnTitle = () => {
    if (!editingColumn || !newColumnTitle.trim()) return

    const updatedColumns = columns.map((c) =>
      c.id === editingColumn.id ? { ...c, title: newColumnTitle.trim() } : c
    )
    setColumns(updatedColumns)
    onColumnsChange?.(updatedColumns)
    setColumnDialogOpen(false)
    setEditingColumn(null)
    setNewColumnTitle('')
  }

  const handleDeleteColumn = (columnId: string) => {
    const columnTickets = ticketsByColumn.get(columnId) ?? []
    if (columnTickets.length > 0) {
      return
    }

    const updatedColumns = columns.filter((c) => c.id !== columnId)
    setColumns(updatedColumns)
    onColumnsChange?.(updatedColumns)
  }

  const handleColorChange = (columnId: string, color: string) => {
    const updatedColumns = columns.map((c) =>
      c.id === columnId ? { ...c, color } : c
    )
    setColumns(updatedColumns)
    onColumnsChange?.(updatedColumns)
  }

  const handleAddColumn = () => {
    if (!newColumnName.trim()) return

    const newColumn: KanbanColumn = {
      id: `column-${Date.now()}`,
      title: newColumnName.trim(),
      status: newColumnStatus,
      color: newColumnColor,
    }

    const updatedColumns = [...columns, newColumn]
    setColumns(updatedColumns)
    onColumnsChange?.(updatedColumns)
    setAddColumnDialogOpen(false)
    setNewColumnName('')
    setNewColumnColor(COLUMN_COLORS[0].value)
    setNewColumnStatus('backlog')
  }

  const activeTicketColumn = activeTicket ? findColumnByTicketId(activeTicket.id) : null

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Kanban Board</h2>
          <Badge variant="secondary">{tickets.length} tickets</Badge>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddColumnDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Column
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-w-max">
            {columns.map((column) => (
              <KanbanColumnComponent
                key={column.id}
                column={column}
                tickets={ticketsByColumn.get(column.id) ?? []}
                onTicketClick={onTicketClick}
                onEditColumn={() => handleEditColumn(column)}
                onDeleteColumn={() => handleDeleteColumn(column.id)}
                onColorChange={(color) => handleColorChange(column.id, color)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTicket && activeTicketColumn && (
              <TicketCardOverlay
                ticket={activeTicket}
                columnColor={activeTicketColumn.color}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <Dialog open={columnDialogOpen} onOpenChange={setColumnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Column</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              placeholder="Column name..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveColumnTitle()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setColumnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveColumnTitle} disabled={!newColumnTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addColumnDialogOpen} onOpenChange={setAddColumnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Column Name</label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Enter column name..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status Mapping</label>
              <select
                value={newColumnStatus}
                onChange={(e) => setNewColumnStatus(e.target.value as TicketStatus)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="backlog">Backlog</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Palette className="h-4 w-4" />
                Column Color
              </label>
              <div className="grid grid-cols-5 gap-2">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={cn(
                      'h-8 w-8 rounded-full transition-all hover:scale-110',
                      newColumnColor === c.value && 'ring-2 ring-offset-2 ring-offset-background ring-primary'
                    )}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setNewColumnColor(c.value)}
                    title={c.name}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim()}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
