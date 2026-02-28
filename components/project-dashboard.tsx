'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { Ticket, TicketComplexity, AgentRole, Project, Epic, TicketLevel } from '@/lib/types'
import { TicketStatus } from '@/lib/types'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TicketDetail } from '@/components/ticket-detail'
import { EpicManager } from '@/components/epic-manager'
import { DependencyGraph } from '@/components/dependency-graph'
import { isTicketBlocked } from '@/lib/dependency-utils'
import { Tooltip, InfoTooltip, TERM_DEFINITIONS, ROLE_DESCRIPTIONS, COMPLEXITY_DESCRIPTIONS } from '@/components/ui/tooltip'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { CreateTicketDialog } from '@/components/create-ticket-dialog'
import { WorkflowHelpButton } from '@/components/workflow-help'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  Search,
  ClipboardList,
  Code2,
  TestTube2,
  Shield,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  GitBranch,
  Link2,
  Trash2,
  CheckSquare,
  Square,
  Filter,
  XCircle,
  GripVertical,
  Plus,
  Loader2,
  Wand2,
  Figma,
  List,
  Network,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { PRDEditor } from '@/components/prd-editor'
import { FigmaPanel } from '@/components/figma-panel'
import { PRDGeneratorDialog } from '@/components/prd-generator'
import type { PRDTemplateType } from '@/lib/prd-templates'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

type DashboardTab = 'board' | 'epics' | 'dependencies' | 'prd' | 'figma'

function EpicManagerWrapper({ project }: { project: Project }) {
  const updateProject = useSwarmStore((s) => s.updateProject)

  const handleCreateEpic = useCallback(async (
    epicData: Omit<Epic, 'id' | 'projectId' | 'progress' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/epics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(epicData),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create epic')
      }
      const newEpic = await res.json()
      updateProject(project.id, {
        epics: [...project.epics, newEpic],
      })
      toast.success('Epic created')
    } catch (err) {
      toast.error('Failed to create epic', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [project, updateProject])

  const handleUpdateEpic = useCallback(async (epicId: string, update: Partial<Epic>) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/epics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId, ...update }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update epic')
      }
      const updatedEpic = await res.json()
      updateProject(project.id, {
        epics: project.epics.map((e) => (e.id === epicId ? updatedEpic : e)),
      })
      toast.success('Epic updated')
    } catch (err) {
      toast.error('Failed to update epic', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [project, updateProject])

  const handleDeleteEpic = useCallback(async (epicId: string) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/epics`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete epic')
      }
      updateProject(project.id, {
        epics: project.epics.filter((e) => e.id !== epicId),
        tickets: project.tickets.map((t) =>
          t.epicId === epicId ? { ...t, epicId: undefined } : t
        ),
      })
      toast.success('Epic deleted')
    } catch (err) {
      toast.error('Failed to delete epic', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [project, updateProject])

  const handleAssignTicket = useCallback(async (ticketId: string, epicId: string | undefined) => {
    try {
      const ticket = project.tickets.find((t) => t.id === ticketId)
      if (!ticket) return

      const oldEpicId = ticket.epicId
      const updatedTickets = project.tickets.map((t) =>
        t.id === ticketId ? { ...t, epicId, updatedAt: Date.now() } : t
      )

      const updatedEpics = project.epics.map((e) => {
        if (e.id === oldEpicId) {
          return { ...e, ticketIds: e.ticketIds.filter((id) => id !== ticketId) }
        }
        if (e.id === epicId) {
          return { ...e, ticketIds: [...e.ticketIds, ticketId] }
        }
        return e
      })

      if (epicId) {
        const res = await fetch(`/api/projects/${project.id}/epics`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            epicId,
            ticketIds: updatedEpics.find((e) => e.id === epicId)?.ticketIds,
          }),
        })
        if (!res.ok) {
          throw new Error('Failed to assign ticket')
        }
      }

      updateProject(project.id, {
        tickets: updatedTickets,
        epics: updatedEpics,
      })
    } catch (err) {
      toast.error('Failed to assign ticket', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [project, updateProject])

  return (
    <EpicManager
      projectId={project.id}
      epics={project.epics}
      tickets={project.tickets}
      onCreateEpic={handleCreateEpic}
      onUpdateEpic={handleUpdateEpic}
      onDeleteEpic={handleDeleteEpic}
      onAssignTicket={handleAssignTicket}
    />
  )
}

const ROLE_ICONS: Record<AgentRole, typeof Search> = {
  researcher: Search,
  planner: ClipboardList,
  coder: Code2,
  validator: TestTube2,
  security: Shield,
  synthesizer: Sparkles,
}

const PIPELINE_STAGES: { role: AgentRole; label: string }[] = [
  { role: 'researcher', label: 'Research' },
  { role: 'planner', label: 'Plan' },
  { role: 'coder', label: 'Code' },
  { role: 'validator', label: 'Validate' },
  { role: 'security', label: 'Security' },
  { role: 'synthesizer', label: 'Synthesize' },
]

const BOARD_COLUMNS: { status: TicketStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: '#71717a' },
  { status: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { status: 'review', label: 'Review', color: '#eab308' },
  { status: 'done', label: 'Done', color: '#22c55e' },
  { status: 'rejected', label: 'Rejected', color: '#ef4444' },
]

const COMPLEXITY_COLORS: Record<TicketComplexity, string> = {
  S: '#22c55e',
  M: '#3b82f6',
  L: '#f59e0b',
  XL: '#ef4444',
}

const LEVEL_COLORS: Record<TicketLevel, string> = {
  feature: 'bg-purple-500',
  epic: 'bg-blue-500',
  story: 'bg-green-500',
  task: 'bg-yellow-500',
  subtask: 'bg-orange-500',
  subatomic: 'bg-red-500',
}

const LEVEL_TEXT_COLORS: Record<TicketLevel, string> = {
  feature: 'text-purple-100',
  epic: 'text-blue-100',
  story: 'text-green-100',
  task: 'text-yellow-100',
  subtask: 'text-orange-100',
  subatomic: 'text-red-100',
}

const LEVEL_DEPTH: Record<TicketLevel, number> = {
  feature: 0,
  epic: 1,
  story: 2,
  task: 3,
  subtask: 4,
  subatomic: 5,
}

function LevelBadge({ level }: { level?: TicketLevel }) {
  if (!level) return null
  
  return (
    <Badge
      className={cn(
        'text-[9px] px-1.5 py-0 h-4 font-medium',
        LEVEL_COLORS[level],
        LEVEL_TEXT_COLORS[level]
      )}
    >
      {level}
    </Badge>
  )
}

function DashboardTicketCardSkeleton() {
  return (
    <Card className="border-border bg-card/80">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-3.5 rounded-full" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-20 rounded-full ml-auto" />
        </div>
      </CardContent>
    </Card>
  )
}

function DashboardColumnSkeleton({ label, color }: { label: string; color: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h4 className="text-sm font-medium text-foreground">{label}</h4>
        </div>
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
      <div className="space-y-2 min-h-[100px] rounded-lg p-2 border-2 border-transparent">
        {[1, 2].map((i) => (
          <DashboardTicketCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <Skeleton className="h-5 w-5 mb-1 rounded" />
            <Skeleton className="h-8 w-12 mb-1" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const PRD_STATUS_COLORS: Record<string, string> = {
  draft: '#eab308',
  approved: '#22c55e',
  rejected: '#ef4444',
}

function computeDonutData(tickets: Ticket[]) {
  const completed = tickets.filter((t) => t.status === 'done').length
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length
  const pending = tickets.filter((t) => t.status === 'backlog' || t.status === 'review').length
  const failed = tickets.filter((t) => t.status === 'rejected').length
  return [
    { name: 'Completed', value: completed, color: '#22c55e' },
    { name: 'In Progress', value: inProgress, color: '#3b82f6' },
    { name: 'Pending', value: pending, color: '#71717a' },
    { name: 'Failed', value: failed, color: '#ef4444' },
  ].filter((d) => d.value > 0)
}

function PRDSection({ project }: { project: Project }) {
  const updateProject = useSwarmStore((s) => s.updateProject)
  const [expanded, setExpanded] = useState(true)

  if (!project.prd) return null

  const prdStatus = project.prdStatus ?? 'draft'

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              <InfoTooltip term="PRD" description={TERM_DEFINITIONS.PRD} /> - Product Requirements Document
            </CardTitle>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5"
              style={{
                color: PRD_STATUS_COLORS[prdStatus],
                borderColor: PRD_STATUS_COLORS[prdStatus],
              }}
            >
              {prdStatus}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {prdStatus === 'draft' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
                  onClick={() => updateProject(project.id, { prdStatus: 'approved' })}
                >
                  <Check className="h-3 w-3" />
                  Approve PRD
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                  onClick={() => updateProject(project.id, { prdStatus: 'rejected' })}
                >
                  <X className="h-3 w-3" />
                  Reject PRD
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="prose prose-sm prose-invert max-w-none text-sm text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {project.prd}
          </ReactMarkdown>
        </CardContent>
      )}
    </Card>
  )
}

function TicketCardContent({
  ticket,
  allTickets,
  onClick,
  isSelected,
  onSelectToggle,
  showCheckbox,
  isDragging,
  showDragHandle,
}: {
  ticket: Ticket
  allTickets: Ticket[]
  onClick?: () => void
  isSelected?: boolean
  onSelectToggle?: (ticketId: string) => void
  showCheckbox?: boolean
  isDragging?: boolean
  showDragHandle?: boolean
}) {
  const approveTicket = useSwarmStore((s) => s.approveTicket)
  const rejectTicket = useSwarmStore((s) => s.rejectTicket)
  const RoleIcon = ROLE_ICONS[ticket.assignedRole]
  const isReview = ticket.status === 'review'
  const blocked = isTicketBlocked(ticket, allTickets)
  const dependencyCount = (ticket.dependencies?.length || 0) + (ticket.blockedBy?.length || 0)
  const blockedByCount = ticket.blockedBy?.filter((depId) => {
    const dep = allTickets.find((t) => t.id === depId)
    return dep && dep.status !== 'done' && dep.status !== 'approved'
  }).length || 0

  const indentLevel = ticket.level ? LEVEL_DEPTH[ticket.level] : 0
  const indentPx = indentLevel * 8

  return (
    <Card
      className={cn(
        'border-border bg-card/80 cursor-pointer hover:border-primary/30 transition-all',
        blocked && 'border-red-500/30',
        isSelected && 'ring-2 ring-primary/50',
        isDragging && 'opacity-50 shadow-lg scale-105 ring-2 ring-primary'
      )}
      style={{ marginLeft: `${indentPx}px` }}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          {showDragHandle && (
            <div 
              className="shrink-0 cursor-grab active:cursor-grabbing text-muted hover:text-foreground min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center -m-2 sm:m-0 p-2 sm:p-0 rounded-lg sm:rounded-none hover:bg-muted/20 sm:hover:bg-transparent"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-5 w-5 sm:h-4 sm:w-4" />
            </div>
          )}
          {showCheckbox && (
            <button
              className="shrink-0 mt-0.5"
              onClick={(e) => {
                e.stopPropagation()
                onSelectToggle?.(ticket.id)
              }}
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4 text-muted hover:text-foreground" />
              )}
            </button>
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <LevelBadge level={ticket.level} />
            <span className="text-sm font-medium text-foreground line-clamp-1">{ticket.title}</span>
          </div>
          <Tooltip content={COMPLEXITY_DESCRIPTIONS[ticket.complexity]}>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] px-1.5"
              style={{ color: COMPLEXITY_COLORS[ticket.complexity], borderColor: COMPLEXITY_COLORS[ticket.complexity] }}
            >
              {ticket.complexity}
            </Badge>
          </Tooltip>
        </div>
        {ticket.description && (
          <p className="text-xs text-muted line-clamp-2">{ticket.description}</p>
        )}
        <div className="flex items-center gap-2">
          <Tooltip content={ROLE_DESCRIPTIONS[ticket.assignedRole]}>
            <span className="flex items-center gap-1.5 cursor-help">
              <RoleIcon className="h-3.5 w-3.5" style={{ color: ROLE_COLORS[ticket.assignedRole] }} />
              <span className="text-xs text-muted border-b border-dotted border-muted-foreground/30">{ROLE_LABELS[ticket.assignedRole]}</span>
            </span>
          </Tooltip>
          {dependencyCount > 0 && (
            <Tooltip content={`${dependencyCount} dependencies${blockedByCount > 0 ? `, ${blockedByCount} blocking` : ''}`}>
              <span className="flex items-center gap-0.5">
                <Link2 className={`h-3 w-3 ${blocked ? 'text-red-500' : 'text-muted'}`} />
                <span className={`text-[10px] ${blocked ? 'text-red-500' : 'text-muted'}`}>
                  {dependencyCount}
                </span>
              </span>
            </Tooltip>
          )}
          {blocked && (
            <Tooltip content={TERM_DEFINITIONS.Blocked}>
              <Badge variant="destructive" className="text-[10px] px-1 gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />
                Blocked
              </Badge>
            </Tooltip>
          )}
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {ticket.status.replace('_', ' ')}
          </Badge>
        </div>
        {isReview && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 text-[10px] flex-1 text-green-500 border-green-500/30 hover:bg-green-500/10"
              onClick={(e) => {
                e.stopPropagation()
                approveTicket(ticket.id)
              }}
            >
              <Check className="h-3 w-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 text-[10px] flex-1 text-red-500 border-red-500/30 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation()
                rejectTicket(ticket.id)
              }}
            >
              <X className="h-3 w-3" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DraggableTicketCard({
  ticket,
  allTickets,
  onClick,
  isSelected,
  onSelectToggle,
  showCheckbox,
}: {
  ticket: Ticket
  allTickets: Ticket[]
  onClick: () => void
  isSelected?: boolean
  onSelectToggle?: (ticketId: string) => void
  showCheckbox?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TicketCardContent
        ticket={ticket}
        allTickets={allTickets}
        onClick={onClick}
        isSelected={isSelected}
        onSelectToggle={onSelectToggle}
        showCheckbox={showCheckbox}
        isDragging={isDragging}
        showDragHandle={true}
      />
    </div>
  )
}

function DroppableColumn({
  status,
  label,
  color,
  tickets,
  allTickets,
  isOver,
  onTicketClick,
  selectedTicketId,
  selectedTicketIds,
  handleSelectToggle,
  showCheckboxes,
  isCollapsed,
  onToggleCollapse,
}: {
  status: TicketStatus
  label: string
  color: string
  tickets: Ticket[]
  allTickets: Ticket[]
  isOver: boolean
  onTicketClick: (ticketId: string) => void
  selectedTicketId: string | null
  selectedTicketIds: Set<string>
  handleSelectToggle: (ticketId: string) => void
  showCheckboxes: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: { status },
  })

  const isRejected = status === 'rejected'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h4 className="text-sm font-medium text-foreground">{label}</h4>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px]">{tickets.length}</Badge>
          {isRejected && tickets.length > 0 && onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={onToggleCollapse}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>
      {!(isRejected && isCollapsed) && (
        <div
          ref={setNodeRef}
          className={`space-y-2 min-h-[100px] rounded-lg p-2 transition-all ${
            isOver
              ? 'bg-primary/10 border-2 border-dashed border-primary'
              : 'border-2 border-transparent'
          }`}
        >
          {tickets.map((ticket) => (
            <DraggableTicketCard
              key={ticket.id}
              ticket={ticket}
              allTickets={allTickets}
              onClick={() => onTicketClick(ticket.id)}
              isSelected={selectedTicketIds.has(ticket.id)}
              onSelectToggle={handleSelectToggle}
              showCheckbox={showCheckboxes}
            />
          ))}
          {tickets.length === 0 && (
            <div className={`flex h-20 items-center justify-center rounded-lg border border-dashed ${
              isOver ? 'border-primary bg-primary/5' : 'border-border'
            }`}>
              <span className="text-xs text-muted">
                {isOver ? 'Drop here' : 'No tickets'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TreeTicketNode({
  ticket,
  allTickets,
  depth,
  isExpanded,
  onToggle,
  onTicketClick,
  getChildTickets,
  expandedNodes,
}: {
  ticket: Ticket
  allTickets: Ticket[]
  depth: number
  isExpanded: boolean
  onToggle: (ticketId: string) => void
  onTicketClick: (ticketId: string) => void
  getChildTickets: (parentId: string) => Ticket[]
  expandedNodes: Set<string>
}) {
  const children = getChildTickets(ticket.id)
  const hasChildren = children.length > 0
  const RoleIcon = ROLE_ICONS[ticket.assignedRole]

  return (
    <div>
      <Collapsible open={isExpanded} onOpenChange={() => onToggle(ticket.id)}>
        <div
          className={cn(
            'flex items-center gap-2 p-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors',
            'border border-transparent hover:border-border'
          )}
          style={{ marginLeft: `${depth * 20}px` }}
        >
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <button className="p-0.5 hover:bg-secondary rounded" onClick={(e) => e.stopPropagation()}>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted" />
                )}
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="w-5" />
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => onTicketClick(ticket.id)}>
            <LevelBadge level={ticket.level} />
            <span className="text-sm font-medium text-foreground truncate">{ticket.title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RoleIcon className="h-3.5 w-3.5" style={{ color: ROLE_COLORS[ticket.assignedRole] }} />
            <Badge
              variant="outline"
              className="text-[10px] px-1.5"
              style={{ color: COMPLEXITY_COLORS[ticket.complexity], borderColor: COMPLEXITY_COLORS[ticket.complexity] }}
            >
              {ticket.complexity}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {ticket.status.replace('_', ' ')}
            </Badge>
            {hasChildren && (
              <Badge variant="outline" className="text-[10px] text-muted">
                {children.length} child{children.length !== 1 ? 'ren' : ''}
              </Badge>
            )}
          </div>
        </div>
        {hasChildren && (
          <CollapsibleContent>
            {children.map(child => (
              <TreeTicketNode
                key={child.id}
                ticket={child}
                allTickets={allTickets}
                depth={depth + 1}
                isExpanded={expandedNodes.has(child.id)}
                onToggle={onToggle}
                onTicketClick={onTicketClick}
                getChildTickets={getChildTickets}
                expandedNodes={expandedNodes}
              />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

interface ProjectDashboardProps {
  onProjectSelect?: (projectId: string | null) => void
  onTicketSelect?: (ticketId: string | null) => void
  initialTicketId?: string | null
}

export function ProjectDashboard({ 
  onProjectSelect, 
  onTicketSelect,
  initialTicketId 
}: ProjectDashboardProps) {
  const tickets = useSwarmStore((s) => s.tickets)
  const projects = useSwarmStore((s) => s.projects)
  const currentProjectId = useSwarmStore((s) => s.currentProjectId)
  const updateProject = useSwarmStore((s) => s.updateProject)
  const [selectedTicketId, setSelectedTicketIdInternal] = useState<string | null>(initialTicketId ?? null)
  const [activeTab, setActiveTab] = useState<DashboardTab>('board')

  // G-IA-01: Wrapper to update URL when ticket selection changes
  const setSelectedTicketId = useCallback((ticketId: string | null) => {
    setSelectedTicketIdInternal(ticketId)
    onTicketSelect?.(ticketId)
  }, [onTicketSelect])

  // G-IA-01: Sync initialTicketId from URL
  useEffect(() => {
    if (initialTicketId !== undefined && initialTicketId !== selectedTicketId) {
      setSelectedTicketIdInternal(initialTicketId)
    }
  }, [initialTicketId, selectedTicketId])
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set())
  const [showCheckboxes, setShowCheckboxes] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isLoadingTickets, setIsLoadingTickets] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [epicFilter, setEpicFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat')
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Set<string>>(new Set())

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const previousTicketsRef = useRef<Ticket[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  const currentProject = projects.find((p) => p.id === currentProjectId)

  const baseTickets = useMemo(() => {
    if (currentProject && currentProject.tickets.length > 0) {
      return currentProject.tickets
    }
    return tickets
  }, [currentProject, tickets])

  const allTickets = useMemo(() => {
    let filtered = baseTickets

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter((t) =>
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => t.status === statusFilter)
    }

    if (roleFilter !== 'all') {
      filtered = filtered.filter((t) => t.assignedRole === roleFilter)
    }

    if (epicFilter !== 'all') {
      if (epicFilter === 'none') {
        filtered = filtered.filter((t) => !t.epicId)
      } else {
        filtered = filtered.filter((t) => t.epicId === epicFilter)
      }
    }

    return filtered
  }, [baseTickets, searchQuery, statusFilter, roleFilter, epicFilter])

  const hasActiveFilters = searchQuery.trim() || statusFilter !== 'all' || roleFilter !== 'all' || epicFilter !== 'all'

  const clearAllFilters = useCallback(() => {
    setSearchQuery('')
    setStatusFilter('all')
    setRoleFilter('all')
    setEpicFilter('all')
  }, [])

  const handleTicketCreated = useCallback(async () => {
    if (!currentProjectId) return
    setIsLoadingTickets(true)
    try {
      const res = await fetch(`/api/projects/${currentProjectId}`)
      if (res.ok) {
        const project = await res.json()
        updateProject(currentProjectId, { tickets: project.tickets, epics: project.epics })
      }
    } catch {
      // Silently fail - the ticket was created, just couldn't refresh
    } finally {
      setIsLoadingTickets(false)
    }
  }, [currentProjectId, updateProject])

  const handleSelectToggle = useCallback((ticketId: string) => {
    setSelectedTicketIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(ticketId)) {
        newSet.delete(ticketId)
      } else {
        newSet.add(ticketId)
      }
      return newSet
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedTicketIds.size === allTickets.length) {
      setSelectedTicketIds(new Set())
    } else {
      setSelectedTicketIds(new Set(allTickets.map((t) => t.id)))
    }
  }, [allTickets, selectedTicketIds.size])

  const handleClearSelection = useCallback(() => {
    setSelectedTicketIds(new Set())
    setShowCheckboxes(false)
  }, [])

  const handleBulkStatusChange = useCallback(async (newStatus: TicketStatus) => {
    if (!currentProject || selectedTicketIds.size === 0) return

    const updatedTickets = currentProject.tickets.map((t) =>
      selectedTicketIds.has(t.id)
        ? { ...t, status: newStatus, updatedAt: Date.now() }
        : t
    )

    updateProject(currentProject.id, { tickets: updatedTickets })
    toast.success(`Updated ${selectedTicketIds.size} ticket(s) to ${newStatus.replace('_', ' ')}`)
    handleClearSelection()
  }, [currentProject, selectedTicketIds, updateProject, handleClearSelection])

  const handleBulkDelete = useCallback(async () => {
    if (!currentProject || selectedTicketIds.size === 0) return

    const updatedTickets = currentProject.tickets.filter((t) => !selectedTicketIds.has(t.id))
    const updatedEpics = currentProject.epics.map((e) => ({
      ...e,
      ticketIds: e.ticketIds.filter((id) => !selectedTicketIds.has(id)),
    }))

    updateProject(currentProject.id, { tickets: updatedTickets, epics: updatedEpics })
    toast.success(`Deleted ${selectedTicketIds.size} ticket(s)`)
    handleClearSelection()
    setShowDeleteConfirm(false)
  }, [currentProject, selectedTicketIds, updateProject, handleClearSelection])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event
    setOverId(over ? (over.id as string) : null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)

    if (!over || !currentProject) return

    const ticketId = active.id as string
    const newStatus = over.id as TicketStatus

    const ticket = currentProject.tickets.find((t) => t.id === ticketId)
    if (!ticket) return

    if (ticket.status === newStatus) return

    previousTicketsRef.current = currentProject.tickets

    const updatedTickets = currentProject.tickets.map((t) =>
      t.id === ticketId ? { ...t, status: newStatus, updatedAt: Date.now() } : t
    )
    updateProject(currentProject.id, { tickets: updatedTickets })

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/tickets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status: newStatus }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update ticket')
      }

      toast.success(`Moved "${ticket.title}" to ${newStatus.replace('_', ' ')}`)
    } catch (err) {
      updateProject(currentProject.id, { tickets: previousTicketsRef.current })
      toast.error('Failed to update ticket status', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [currentProject, updateProject])

  const toggleTreeNode = useCallback((ticketId: string) => {
    setExpandedTreeNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(ticketId)) {
        newSet.delete(ticketId)
      } else {
        newSet.add(ticketId)
      }
      return newSet
    })
  }, [])

  const rootTickets = useMemo(() => {
    return allTickets.filter(t => !t.parentId)
  }, [allTickets])

  const getChildTickets = useCallback((parentId: string) => {
    return allTickets.filter(t => t.parentId === parentId)
  }, [allTickets])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setOverId(null)
  }, [])

  const activeTicket = useMemo(() => {
    if (!activeId) return null
    return allTickets.find((t) => t.id === activeId) || null
  }, [activeId, allTickets])

  const blockedCount = useMemo(() => {
    return allTickets.filter((t) => isTicketBlocked(t, allTickets)).length
  }, [allTickets])

  const donutData = useMemo(() => computeDonutData(allTickets), [allTickets])
  const totalTickets = allTickets.length
  const completedCount = allTickets.filter((t) => t.status === 'done').length
  const failedCount = allTickets.filter((t) => t.status === 'rejected').length
  const completionPct = totalTickets > 0 ? Math.round((completedCount / totalTickets) * 100) : 0

  const avgConfidence = useMemo(() => {
    const withConf = allTickets.filter((t) => t.confidence != null)
    if (withConf.length === 0) return 0
    return Math.round(withConf.reduce((sum, t) => sum + (t.confidence ?? 0), 0) / withConf.length)
  }, [allTickets])

  const selectedTicket = allTickets.find((t) => t.id === selectedTicketId)

  const [rejectedExpanded, setRejectedExpanded] = useState(false)
  const [isGeneratingTickets, setIsGeneratingTickets] = useState(false)
  const [showGenerateTicketsDialog, setShowGenerateTicketsDialog] = useState(false)
  const [showPRDGenerator, setShowPRDGenerator] = useState(false)
  const [ticketPreview, setTicketPreview] = useState<{
    tickets: Array<{ title: string; level: string; complexity: string }>
    hierarchy: { epics: number; stories: number; tasks: number; orphans: number }
    effort: { totalDays: { min: number; max: number } }
  } | null>(null)

  const setMode = useSwarmStore((s) => s.setMode)

  const handlePRDChange = useCallback((prd: string, status: 'draft' | 'approved' | 'rejected') => {
    if (currentProject) {
      updateProject(currentProject.id, { prd, prdStatus: status })
    }
  }, [currentProject, updateProject])

  const handlePRDGenerated = useCallback(async (prd: string, _type: PRDTemplateType) => {
    if (!currentProject) return
    
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/prd`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prd, status: 'draft' }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save PRD')
      }

      updateProject(currentProject.id, { prd, prdStatus: 'draft' })
      setShowPRDGenerator(false)
      toast.success('PRD created successfully')
    } catch (err) {
      toast.error('Failed to save PRD', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }, [currentProject, updateProject])

  const handleGenerateTicketsPreview = useCallback(async () => {
    if (!currentProject) return
    
    setIsGeneratingTickets(true)
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/generate-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true }),
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate tickets preview')
      }
      
      const data = await res.json()
      setTicketPreview(data)
      setShowGenerateTicketsDialog(true)
    } catch (err) {
      toast.error('Failed to generate tickets', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGeneratingTickets(false)
    }
  }, [currentProject])

  const handleConfirmGenerateTickets = useCallback(async () => {
    if (!currentProject) return
    
    setIsGeneratingTickets(true)
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/generate-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: false }),
      })
      
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to generate tickets')
      }
      
      const data = await res.json()
      
      const projectRes = await fetch(`/api/projects/${currentProject.id}`)
      if (projectRes.ok) {
        const project = await projectRes.json()
        updateProject(currentProject.id, { tickets: project.tickets, epics: project.epics })
      }
      
      setShowGenerateTicketsDialog(false)
      setTicketPreview(null)
      toast.success(`Generated ${data.created} tickets`, {
        description: `${data.hierarchy.epics} epics, ${data.hierarchy.stories} stories, ${data.hierarchy.tasks} tasks`,
      })
    } catch (err) {
      toast.error('Failed to generate tickets', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setIsGeneratingTickets(false)
    }
  }, [currentProject, updateProject])

  if (allTickets.length === 0 && !currentProject?.prd) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<ClipboardList />}
          title="No project tickets yet"
          description="Describe a project to automatically decompose it into tickets and track progress on this dashboard."
          variant="large"
          action={{
            label: 'Create Project',
            onClick: () => setMode('project'),
            icon: <Plus className="h-4 w-4" />,
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* PRD Section */}
      {currentProject && <PRDSection project={currentProject} />}

      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'board' ? 'default' : 'ghost'}
            size="sm"
            className="gap-2"
            onClick={() => setActiveTab('board')}
          >
            <ClipboardList className="h-4 w-4" />
            Board
          </Button>
          <Tooltip content={TERM_DEFINITIONS.Epic} side="bottom">
            <Button
              variant={activeTab === 'epics' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => setActiveTab('epics')}
            >
              <Layers className="h-4 w-4" />
              Epics
              {currentProject?.epics && currentProject.epics.length > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {currentProject.epics.length}
                </Badge>
              )}
            </Button>
          </Tooltip>
          <Tooltip content="View ticket dependencies and blocked items" side="bottom">
            <Button
              variant={activeTab === 'dependencies' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => setActiveTab('dependencies')}
            >
              <GitBranch className="h-4 w-4" />
              Dependencies
            {blockedCount > 0 && (
              <Badge variant="destructive" className="text-[10px] ml-1">
                {blockedCount} blocked
              </Badge>
            )}
          </Button>
          </Tooltip>
          <Tooltip content="Edit Product Requirements Document" side="bottom">
            <Button
              variant={activeTab === 'prd' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => setActiveTab('prd')}
            >
              <FileText className="h-4 w-4" />
              PRD
              {currentProject?.prd && (
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {currentProject.prdStatus || 'draft'}
                </Badge>
              )}
            </Button>
          </Tooltip>
          <Tooltip content="Browse and import Figma designs" side="bottom">
            <Button
              variant={activeTab === 'figma' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => setActiveTab('figma')}
            >
              <Figma className="h-4 w-4" />
              Figma
            </Button>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          {!currentProject?.prd && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowPRDGenerator(true)}
            >
              <FileText className="h-4 w-4" />
              Create PRD
            </Button>
          )}
          {currentProject?.prd && currentProject.prdStatus === 'approved' && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleGenerateTicketsPreview}
              disabled={isGeneratingTickets}
            >
              {isGeneratingTickets ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              Generate Tickets from PRD
            </Button>
          )}
          <WorkflowHelpButton />
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'epics' && currentProject && (
        <EpicManagerWrapper project={currentProject} />
      )}
      {activeTab === 'dependencies' && (
        <DependencyGraph
          tickets={allTickets}
          onTicketClick={(ticket) => setSelectedTicketId(ticket.id)}
        />
      )}
      {activeTab === 'prd' && currentProject && (
        <PRDEditor
          projectId={currentProject.id}
          initialPRD={currentProject.prd || ''}
          initialStatus={currentProject.prdStatus || 'draft'}
          projectName={currentProject.name}
          projectDescription={currentProject.description}
          onPRDChange={handlePRDChange}
        />
      )}
      {activeTab === 'figma' && (
        <div className="h-[600px] border border-border rounded-lg overflow-hidden">
          <FigmaPanel
            projectId={currentProject?.id}
          />
        </div>
      )}

      {/* Generate Tickets Dialog */}
      <Dialog open={showGenerateTicketsDialog} onOpenChange={setShowGenerateTicketsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Generate Tickets from PRD
            </DialogTitle>
            <DialogDescription>
              Review the tickets that will be generated from your PRD before creating them.
            </DialogDescription>
          </DialogHeader>
          {ticketPreview && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 gap-4">
                <Card className="border-border">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{ticketPreview.hierarchy.epics}</div>
                    <div className="text-xs text-muted">Epics</div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{ticketPreview.hierarchy.stories}</div>
                    <div className="text-xs text-muted">Stories</div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">{ticketPreview.hierarchy.tasks}</div>
                    <div className="text-xs text-muted">Tasks</div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl font-bold text-foreground">
                      {ticketPreview.effort.totalDays.min}-{ticketPreview.effort.totalDays.max}
                    </div>
                    <div className="text-xs text-muted">Est. Days</div>
                  </CardContent>
                </Card>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2 rounded-md border border-border p-3">
                {ticketPreview.tickets.map((ticket, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {ticket.level}
                      </Badge>
                      <span className="text-sm text-foreground">{ticket.title}</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px]"
                      style={{
                        color: ticket.complexity === 'S' ? '#22c55e' :
                               ticket.complexity === 'M' ? '#3b82f6' :
                               ticket.complexity === 'L' ? '#f59e0b' : '#ef4444',
                      }}
                    >
                      {ticket.complexity}
                    </Badge>
                  </div>
                ))}
              </div>
              {ticketPreview.hierarchy.orphans > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 text-yellow-500">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">
                    {ticketPreview.hierarchy.orphans} ticket(s) have missing parent references
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowGenerateTicketsDialog(false)
                setTicketPreview(null)
              }}
              disabled={isGeneratingTickets}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmGenerateTickets} disabled={isGeneratingTickets}>
              {isGeneratingTickets ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create {ticketPreview?.tickets.length || 0} Tickets
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PRD Generator Dialog */}
      {currentProject && (
        <PRDGeneratorDialog
          open={showPRDGenerator}
          onOpenChange={setShowPRDGenerator}
          projectId={currentProject.id}
          onPRDGenerated={handlePRDGenerated}
        />
      )}
      
      {activeTab === 'board' && (
        <>
      {/* Search/Filter Bar and Create Ticket */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="researcher">Researcher</SelectItem>
                  <SelectItem value="planner">Planner</SelectItem>
                  <SelectItem value="coder">Coder</SelectItem>
                  <SelectItem value="validator">Validator</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="synthesizer">Synthesizer</SelectItem>
                </SelectContent>
              </Select>
              {currentProject?.epics && currentProject.epics.length > 0 && (
                <Select value={epicFilter} onValueChange={setEpicFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Epic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Epics</SelectItem>
                    <SelectItem value="none">No Epic</SelectItem>
                    {currentProject.epics.map((epic) => (
                      <SelectItem key={epic.id} value={epic.id}>
                        {epic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* View Mode Toggle */}
              <div className="flex items-center border border-border rounded-md">
                <Button
                  variant={viewMode === 'flat' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2 rounded-r-none"
                  onClick={() => setViewMode('flat')}
                  title="Flat view"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2 rounded-l-none"
                  onClick={() => setViewMode('tree')}
                  title="Tree view"
                >
                  <Network className="h-4 w-4" />
                </Button>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted hover:text-foreground"
                  onClick={clearAllFilters}
                >
                  <XCircle className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </div>
          {currentProject && (
            <CreateTicketDialog
              projectId={currentProject.id}
              epics={currentProject.epics || []}
              allTickets={currentProject.tickets || []}
              onTicketCreated={handleTicketCreated}
            />
          )}
        </div>
        {hasActiveFilters && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>Showing {allTickets.length} of {baseTickets.length} tickets</span>
          </div>
        )}
      </div>

      {/* Multi-Select Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={showCheckboxes ? 'secondary' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => {
              setShowCheckboxes(!showCheckboxes)
              if (showCheckboxes) {
                handleClearSelection()
              }
            }}
          >
            <CheckSquare className="h-4 w-4" />
            {showCheckboxes ? 'Exit Selection' : 'Select'}
          </Button>
          {showCheckboxes && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedTicketIds.size === allTickets.length ? 'Deselect All' : 'Select All'}
              </Button>
              {selectedTicketIds.size > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedTicketIds.size} selected
                </Badge>
              )}
            </>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedTicketIds.size > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="h-8 px-2 text-xs rounded-md border border-border bg-background text-foreground"
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkStatusChange(e.target.value as TicketStatus)
                  e.target.value = ''
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Change Status...</option>
              <option value="backlog">Backlog</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
              <option value="rejected">Rejected</option>
            </select>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedTicketIds.size})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-red-500">
                <AlertTriangle className="h-5 w-5" />
                Confirm Delete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted">
                Are you sure you want to delete {selectedTicketIds.size} ticket(s)? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Row (TASK 6) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <ClipboardList className="mb-1 h-5 w-5 text-primary" />
            <span className="text-2xl font-bold text-foreground">{totalTickets}</span>
            <span className="text-xs text-muted">Total Tickets</span>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <CheckCircle2 className="mb-1 h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold text-foreground">{completedCount}</span>
            <span className="text-xs text-muted">Completed</span>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <AlertTriangle className="mb-1 h-5 w-5 text-red-500" />
            <span className="text-2xl font-bold text-foreground">{failedCount}</span>
            <span className="text-xs text-muted">Failed</span>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center p-4 text-center">
            <Clock className="mb-1 h-5 w-5 text-blue-500" />
            <span className="text-2xl font-bold text-foreground">{avgConfidence}%</span>
            <Tooltip content={TERM_DEFINITIONS.Confidence}>
              <span className="text-xs text-muted border-b border-dotted border-muted-foreground/50 cursor-help">
                Avg Confidence
              </span>
            </Tooltip>
          </CardContent>
        </Card>
      </div>

      {/* Donut + Completion */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted">Completion</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="relative h-40 w-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData.length > 0 ? donutData : [{ name: 'Empty', value: 1, color: '#27272a' }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {(donutData.length > 0 ? donutData : [{ name: 'Empty', value: 1, color: '#27272a' }]).map(
                      (entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      )
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{completionPct}%</span>
                <span className="text-[10px] text-muted">complete</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Stage Bar */}
        <div className="col-span-2">
          <Card className="border-border h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-1">
                {PIPELINE_STAGES.map((stage, idx) => {
                  const stageTickets = allTickets.filter((t) => t.assignedRole === stage.role)
                  const done = stageTickets.filter((t) => t.status === 'done').length
                  const active = stageTickets.some((t) => t.status === 'in_progress')
                  const pct = stageTickets.length > 0 ? Math.round((done / stageTickets.length) * 100) : 0
                  const StageIcon = ROLE_ICONS[stage.role]

                  return (
                    <div key={stage.role} className="flex flex-1 items-center min-w-0">
                      <Tooltip content={ROLE_DESCRIPTIONS[stage.role]}>
                      <div className="flex-1 rounded-lg border border-border p-2.5 transition-all cursor-help">
                        <div className="flex items-center gap-1.5 mb-1">
                          <StageIcon className="h-3.5 w-3.5 shrink-0" style={{ color: ROLE_COLORS[stage.role] }} />
                          <span className="text-[11px] font-medium truncate" style={{ color: ROLE_COLORS[stage.role] }}>
                            {stage.label}
                          </span>
                          {stageTickets.length > 0 && (
                            <span className="ml-auto text-[10px] text-muted">{done}/{stageTickets.length}</span>
                          )}
                        </div>
                        <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: active ? ROLE_COLORS[stage.role] : pct === 100 ? '#22c55e' : ROLE_COLORS[stage.role],
                              opacity: pct > 0 ? 1 : 0.2,
                            }}
                          />
                        </div>
                      </div>
                      </Tooltip>
                      {idx < PIPELINE_STAGES.length - 1 && (
                        <div className="mx-0.5 h-4 w-px bg-border" />
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tree View */}
      {viewMode === 'tree' && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                Ticket Hierarchy
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setExpandedTreeNodes(new Set(allTickets.map(t => t.id)))}
                >
                  Expand All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setExpandedTreeNodes(new Set())}
                >
                  Collapse All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {rootTickets.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm">
                No tickets found. Create a ticket to get started.
              </div>
            ) : (
              rootTickets.map(ticket => (
                <TreeTicketNode
                  key={ticket.id}
                  ticket={ticket}
                  allTickets={allTickets}
                  depth={0}
                  isExpanded={expandedTreeNodes.has(ticket.id)}
                  onToggle={toggleTreeNode}
                  onTicketClick={(ticketId) =>
                    setSelectedTicketId(selectedTicketId === ticketId ? null : ticketId)
                  }
                  getChildTickets={getChildTickets}
                  expandedNodes={expandedTreeNodes}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Kanban Board with Drag and Drop */}
      {viewMode === 'flat' && (
      isLoadingTickets ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {BOARD_COLUMNS.map((col) => (
            <DashboardColumnSkeleton key={col.status} label={col.label} color={col.color} />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5" data-testid="kanban-board">
            {BOARD_COLUMNS.map((col) => {
              const colTickets = allTickets.filter((t) => t.status === col.status)
              const isRejected = col.status === 'rejected'
              const isCollapsed = isRejected && !rejectedExpanded

              return (
                <DroppableColumn
                  key={col.status}
                  status={col.status}
                  label={col.label}
                  color={col.color}
                  tickets={colTickets}
                  allTickets={allTickets}
                  isOver={overId === col.status}
                  onTicketClick={(ticketId) =>
                    setSelectedTicketId(selectedTicketId === ticketId ? null : ticketId)
                  }
                  selectedTicketId={selectedTicketId}
                  selectedTicketIds={selectedTicketIds}
                  handleSelectToggle={handleSelectToggle}
                  showCheckboxes={showCheckboxes}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={isRejected ? () => setRejectedExpanded(!rejectedExpanded) : undefined}
                />
              )
            })}
          </div>

          {/* Drag Overlay */}
          <DragOverlay dropAnimation={{
            duration: 200,
            easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
          }}>
            {activeTicket && (
              <div className="w-[250px]">
                <TicketCardContent
                  ticket={activeTicket}
                  allTickets={allTickets}
                  isDragging={false}
                  showDragHandle={true}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )
      )}

      {/* Ticket Detail */}
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          allTickets={allTickets}
          onClose={() => setSelectedTicketId(null)}
          onSelectTicket={(ticketId) => setSelectedTicketId(ticketId)}
          onUpdate={async (ticketId, updates) => {
            if (!currentProject) return
            try {
              const res = await fetch(`/api/projects/${currentProject.id}/tickets`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, ...updates }),
              })
              if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || 'Failed to update ticket')
              }
              const updatedTicket = await res.json()
              updateProject(currentProject.id, {
                tickets: currentProject.tickets.map((t) =>
                  t.id === ticketId ? { ...t, ...updatedTicket } : t
                ),
              })
            } catch (err) {
              throw err
            }
          }}
        />
      )}
      </>
      )}
    </div>
  )
}
