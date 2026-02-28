'use client'

import { useMemo, useState, useCallback } from 'react'
import type { Ticket, TicketStatus, TicketLevel } from '@/lib/types'
import { buildDependencyGraph, type DependencyNode } from '@/lib/dependency-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Zap,
  ArrowRight,
  Info,
  HelpCircle,
  MousePointer,
  Circle,
  ArrowDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DependencyGraphProps {
  tickets: Ticket[]
  onTicketClick?: (ticket: Ticket) => void
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  backlog: { bg: 'bg-zinc-500/20', border: 'border-zinc-500', text: 'text-muted' },
  in_progress: { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400' },
  review: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400' },
  done: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400' },
  approved: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400' },
  rejected: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400' },
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  backlog: Clock,
  in_progress: Zap,
  review: Clock,
  done: CheckCircle2,
  approved: CheckCircle2,
  rejected: Ban,
}

interface GraphNode {
  id: string
  node: DependencyNode
  x: number
  y: number
  level: number
}

interface GraphEdge {
  from: string
  to: string
  isOnCriticalPath: boolean
}

function calculateLayout(
  nodes: Map<string, DependencyNode>,
  criticalPath: string[]
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[] } {
  const graphNodes: GraphNode[] = []
  const graphEdges: GraphEdge[] = []
  const criticalPathSet = new Set(criticalPath)

  const levels = new Map<number, string[]>()
  let maxLevel = 0

  for (const [id, node] of nodes) {
    const level = node.depth
    maxLevel = Math.max(maxLevel, level)

    if (!levels.has(level)) {
      levels.set(level, [])
    }
    levels.get(level)!.push(id)
  }

  const nodeWidth = 200
  const nodeHeight = 80
  const horizontalGap = 60
  const verticalGap = 40

  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = levels.get(level) || []
    const levelWidth = nodesAtLevel.length * (nodeWidth + horizontalGap) - horizontalGap

    nodesAtLevel.forEach((nodeId, index) => {
      const node = nodes.get(nodeId)
      if (!node) return

      const x = index * (nodeWidth + horizontalGap) - levelWidth / 2 + nodeWidth / 2
      const y = level * (nodeHeight + verticalGap)

      graphNodes.push({
        id: nodeId,
        node,
        x,
        y,
        level,
      })
    })
  }

  for (const [id, node] of nodes) {
    for (const depId of node.dependencies) {
      const isOnCriticalPath =
        criticalPathSet.has(id) && criticalPathSet.has(depId)

      graphEdges.push({
        from: depId,
        to: id,
        isOnCriticalPath,
      })
    }
  }

  return { graphNodes, graphEdges }
}

function GraphNodeComponent({
  graphNode,
  isSelected,
  onClick,
}: {
  graphNode: GraphNode
  isSelected: boolean
  onClick: () => void
}) {
  const { node } = graphNode
  const { ticket, isBlocked, isOnCriticalPath } = node
  const statusColors = STATUS_COLORS[ticket.status] || STATUS_COLORS.backlog
  const StatusIcon = STATUS_ICONS[ticket.status] || Clock

  return (
    <div
      className={cn(
        'absolute w-[200px] p-3 rounded-lg border-2 cursor-pointer transition-all',
        'hover:scale-105 hover:z-10',
        statusColors.bg,
        statusColors.border,
        isOnCriticalPath && 'ring-2 ring-orange-500 ring-offset-2 ring-offset-background',
        isBlocked && 'opacity-60',
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      style={{
        left: `calc(50% + ${graphNode.x}px - 100px)`,
        top: `${graphNode.y}px`,
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium truncate flex-1">{ticket.title}</span>
        <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusColors.text)} />
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <Badge variant="outline" className="text-[9px] px-1">
          {ticket.complexity}
        </Badge>
        <Badge variant="outline" className={cn('text-[9px] px-1', statusColors.text)}>
          {ticket.status.replace('_', ' ')}
        </Badge>
        {isBlocked && (
          <Badge variant="outline" className="text-[9px] px-1 text-red-400 border-red-500/30">
            blocked
          </Badge>
        )}
        {isOnCriticalPath && (
          <Badge variant="outline" className="text-[9px] px-1 text-orange-400 border-orange-500/30">
            critical
          </Badge>
        )}
      </div>
    </div>
  )
}

function GraphEdgeComponent({
  edge,
  fromNode,
  toNode,
}: {
  edge: GraphEdge
  fromNode: GraphNode
  toNode: GraphNode
}) {
  const x1 = fromNode.x
  const y1 = fromNode.y + 80
  const x2 = toNode.x
  const y2 = toNode.y

  const midY = (y1 + y2) / 2

  const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`

  return (
    <path
      d={path}
      fill="none"
      stroke={edge.isOnCriticalPath ? '#f97316' : '#3f3f46'}
      strokeWidth={edge.isOnCriticalPath ? 2 : 1}
      strokeDasharray={edge.isOnCriticalPath ? undefined : '4 2'}
      markerEnd="url(#arrowhead)"
      className="transition-all"
    />
  )
}

function DependencyGraphHelp({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            How to Read This Graph
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-4">
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <Circle className="h-4 w-4 text-primary" />
              What Nodes Represent
            </h4>
            <p className="text-sm text-muted">
              Each box (node) represents a ticket in your project. The node shows the ticket title, complexity, and current status.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <ArrowDown className="h-4 w-4 text-primary" />
              What Edges (Lines) Represent
            </h4>
            <p className="text-sm text-muted">
              Lines connecting nodes show dependencies. An arrow from ticket A to ticket B means B depends on A — ticket A must be completed before B can start.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">
              Color Legend
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-green-500" />
                <span className="text-sm text-muted">Done/Approved - Ticket is complete</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm text-muted">In Progress - Currently being worked on</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <span className="text-sm text-muted">Review - Awaiting approval</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-zinc-500" />
                <span className="text-sm text-muted">Backlog - Not yet started</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm text-muted">Rejected/Blocked - Needs attention</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-6 rounded border-2 border-orange-500" />
                <span className="text-sm text-muted">Critical Path - Longest chain of dependencies</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-primary" />
              How to Interact
            </h4>
            <ul className="text-sm text-muted space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Click</strong> on any ticket to view its details and dependencies</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Scroll</strong> horizontally/vertically to navigate large graphs</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Hover</strong> over nodes to highlight them</span>
              </li>
            </ul>
          </div>

          <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-3">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-orange-400">About the Critical Path</div>
                <p className="text-xs text-orange-400/80 mt-1">
                  The critical path (highlighted in orange) shows the longest chain of dependent tickets. Delays on this path directly impact your project timeline.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TicketDetailDialog({
  ticket,
  allTickets,
  open,
  onClose,
}: {
  ticket: Ticket | null
  allTickets: Ticket[]
  open: boolean
  onClose: () => void
}) {
  if (!ticket) return null

  const ticketMap = new Map(allTickets.map((t) => [t.id, t]))
  const dependencies = ticket.dependencies.map((id) => ticketMap.get(id)).filter(Boolean) as Ticket[]
  const blockedBy = (ticket.blockedBy || []).map((id) => ticketMap.get(id)).filter(Boolean) as Ticket[]
  const dependents = allTickets.filter((t) => t.dependencies.includes(ticket.id))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            {ticket.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <div className="text-xs font-medium text-muted mb-1">Status</div>
            <Badge variant="outline" className={STATUS_COLORS[ticket.status]?.text}>
              {ticket.status.replace('_', ' ')}
            </Badge>
          </div>

          {ticket.description && (
            <div>
              <div className="text-xs font-medium text-muted mb-1">Description</div>
              <p className="text-sm text-foreground">{ticket.description}</p>
            </div>
          )}

          {dependencies.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted mb-2">
                Depends On ({dependencies.length})
              </div>
              <div className="space-y-1">
                {dependencies.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-card/50 border border-border"
                  >
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          dep.status === 'done' || dep.status === 'approved'
                            ? '#22c55e'
                            : '#71717a',
                      }}
                    />
                    <span className="text-xs">{dep.title}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {dep.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockedBy.length > 0 && (
            <div>
              <div className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Blocked By ({blockedBy.length})
              </div>
              <div className="space-y-1">
                {blockedBy.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30"
                  >
                    <Ban className="h-3 w-3 text-red-400" />
                    <span className="text-xs">{blocker.title}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto text-red-400">
                      {blocker.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dependents.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted mb-2">
                Blocks ({dependents.length})
              </div>
              <div className="space-y-1">
                {dependents.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-card/50 border border-border"
                  >
                    <ArrowRight className="h-3 w-3 text-muted" />
                    <span className="text-xs">{dep.title}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {dep.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function isTicketBlocked(ticket: Ticket, allTickets: Ticket[]): boolean {
  const ticketMap = new Map(allTickets.map((t) => [t.id, t]))
  
  if (ticket.blockedBy && ticket.blockedBy.length > 0) {
    return ticket.blockedBy.some((id) => {
      const blocker = ticketMap.get(id)
      return blocker && blocker.status !== 'done' && blocker.status !== 'approved'
    })
  }
  
  if (ticket.dependencies.length > 0) {
    return ticket.dependencies.some((id) => {
      const dep = ticketMap.get(id)
      return dep && dep.status !== 'done' && dep.status !== 'approved'
    })
  }
  
  return false
}

export function DependencyGraph({ tickets, onTicketClick }: DependencyGraphProps) {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all')
  const [levelFilter, setLevelFilter] = useState<TicketLevel | 'all'>('all')
  const [showBlockedOnly, setShowBlockedOnly] = useState(false)

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (levelFilter !== 'all' && t.level !== levelFilter) return false
      if (showBlockedOnly && !isTicketBlocked(t, tickets)) return false
      return true
    })
  }, [tickets, statusFilter, levelFilter, showBlockedOnly])

  const graph = useMemo(() => buildDependencyGraph(filteredTickets), [filteredTickets])
  const { graphNodes, graphEdges } = useMemo(
    () => calculateLayout(graph.nodes, graph.criticalPath),
    [graph]
  )

  const nodeMap = useMemo(
    () => new Map(graphNodes.map((n) => [n.id, n])),
    [graphNodes]
  )

  const stats = useMemo(() => {
    const blocked = Array.from(graph.nodes.values()).filter((n) => n.isBlocked).length
    const ready = Array.from(graph.nodes.values()).filter(
      (n) => !n.isBlocked && n.ticket.status !== 'done' && n.ticket.status !== 'approved'
    ).length
    const done = Array.from(graph.nodes.values()).filter(
      (n) => n.ticket.status === 'done' || n.ticket.status === 'approved'
    ).length
    return { blocked, ready, done, criticalPathLength: graph.criticalPath.length }
  }, [graph])

  const selectedTicket = selectedTicketId
    ? tickets.find((t) => t.id === selectedTicketId) || null
    : null

  const handleNodeClick = useCallback(
    (ticketId: string) => {
      setSelectedTicketId(ticketId)
      const ticket = tickets.find((t) => t.id === ticketId)
      if (ticket && onTicketClick) {
        onTicketClick(ticket)
      }
    },
    [tickets, onTicketClick]
  )

  const graphHeight = useMemo(() => {
    if (graphNodes.length === 0) return 200
    const maxY = Math.max(...graphNodes.map((n) => n.y))
    return maxY + 120
  }, [graphNodes])

  const graphWidth = useMemo(() => {
    if (graphNodes.length === 0) return 400
    const minX = Math.min(...graphNodes.map((n) => n.x))
    const maxX = Math.max(...graphNodes.map((n) => n.x))
    return Math.max(400, maxX - minX + 300)
  }, [graphNodes])

  if (tickets.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <GitBranch className="h-10 w-10 text-muted mb-3" />
          <h4 className="text-sm font-medium text-foreground">No dependencies to visualize</h4>
          <p className="text-xs text-muted mt-1">
            Add dependencies between tickets to see the dependency graph
          </p>
        </CardContent>
      </Card>
    )
  }

  if (filteredTickets.length === 0 && tickets.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Dependency Graph</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | 'all')}>
              <SelectTrigger className="w-32">
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

            <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as TicketLevel | 'all')}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="story">Story</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="subtask">Subtask</SelectItem>
                <SelectItem value="subatomic">Subatomic</SelectItem>
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showBlockedOnly}
                onChange={(e) => setShowBlockedOnly(e.target.checked)}
                className="rounded"
              />
              Blocked only
            </label>
          </div>
        </div>
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <GitBranch className="h-10 w-10 text-muted mb-3" />
            <h4 className="text-sm font-medium text-foreground">No tickets match the current filters</h4>
            <p className="text-xs text-muted mt-1">
              Try adjusting your filter criteria to see more tickets
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Dependency Graph</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {stats.done} done
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              {stats.ready} ready
            </span>
            <span className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              {stats.blocked} blocked
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-orange-500" />
              {stats.criticalPathLength} critical
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | 'all')}>
            <SelectTrigger className="w-32">
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

          <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as TicketLevel | 'all')}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="epic">Epic</SelectItem>
              <SelectItem value="story">Story</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="subtask">Subtask</SelectItem>
              <SelectItem value="subatomic">Subatomic</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showBlockedOnly}
              onChange={(e) => setShowBlockedOnly(e.target.checked)}
              className="rounded"
            />
            Blocked only
          </label>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setShowHelp(true)}
        >
          <HelpCircle className="h-4 w-4" />
          How to read this graph
        </Button>
      </div>

      {graph.hasCircularDependency && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <div>
              <div className="text-sm font-medium text-red-400">Circular Dependency Detected</div>
              <div className="text-xs text-red-400/80">
                {graph.circularChain.map((id) => {
                  const ticket = tickets.find((t) => t.id === id)
                  return ticket?.title || id
                }).join(' → ')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {graph.criticalPath.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/10">
          <CardContent className="flex items-start gap-3 py-3">
            <Zap className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-orange-400">Critical Path</div>
              <div className="text-xs text-orange-400/80 mt-1">
                {graph.criticalPath.map((id, index) => {
                  const ticket = tickets.find((t) => t.id === id)
                  return (
                    <span key={id}>
                      {ticket?.title || id}
                      {index < graph.criticalPath.length - 1 && ' → '}
                    </span>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border overflow-hidden">
        <CardContent className="p-0">
          <div
            className="relative overflow-auto"
            style={{ minHeight: graphHeight, minWidth: graphWidth }}
          >
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: graphHeight }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#3f3f46" />
                </marker>
              </defs>
              <g transform={`translate(${graphWidth / 2}, 20)`}>
                {graphEdges.map((edge, index) => {
                  const fromNode = nodeMap.get(edge.from)
                  const toNode = nodeMap.get(edge.to)
                  if (!fromNode || !toNode) return null
                  return (
                    <GraphEdgeComponent
                      key={`${edge.from}-${edge.to}-${index}`}
                      edge={edge}
                      fromNode={fromNode}
                      toNode={toNode}
                    />
                  )
                })}
              </g>
            </svg>

            <div className="relative" style={{ height: graphHeight, paddingTop: 20 }}>
              {graphNodes.map((graphNode) => (
                <GraphNodeComponent
                  key={graphNode.id}
                  graphNode={graphNode}
                  isSelected={selectedTicketId === graphNode.id}
                  onClick={() => handleNodeClick(graphNode.id)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 text-xs text-muted">
        <Info className="h-3.5 w-3.5" />
        <span>Click on a ticket to view details. Orange highlighted path shows the critical path.</span>
      </div>

      <TicketDetailDialog
        ticket={selectedTicket}
        allTickets={tickets}
        open={!!selectedTicket}
        onClose={() => setSelectedTicketId(null)}
      />

      <DependencyGraphHelp
        open={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  )
}
