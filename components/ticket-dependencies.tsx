'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Ticket } from '@/lib/types'
import { detectCircularDependency, buildDependencyGraph, type DependencyGraph } from '@/lib/dependency-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { 
  GitBranch, AlertTriangle, Plus, X, ArrowRight, 
  Lock, Unlock, ChevronDown, ChevronRight, Link2, Unlink
} from 'lucide-react'

interface TicketDependenciesProps {
  ticket: Ticket
  allTickets: Ticket[]
  onAddDependency?: (ticketId: string, dependencyId: string, type: 'blockedBy' | 'blocks') => Promise<void>
  onRemoveDependency?: (ticketId: string, dependencyId: string, type: 'blockedBy' | 'blocks') => Promise<void>
  disabled?: boolean
}

const STATUS_COLORS: Record<string, string> = {
  backlog: '#71717a',
  in_progress: '#3b82f6',
  review: '#eab308',
  approved: '#22c55e',
  done: '#22c55e',
  rejected: '#ef4444',
}

export function TicketDependencies({
  ticket,
  allTickets,
  onAddDependency,
  onRemoveDependency,
  disabled = false,
}: TicketDependenciesProps) {
  const [isAddingBlockedBy, setIsAddingBlockedBy] = useState(false)
  const [isAddingBlocks, setIsAddingBlocks] = useState(false)
  const [selectedBlockedBy, setSelectedBlockedBy] = useState<string>('')
  const [selectedBlocks, setSelectedBlocks] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const blockedByTickets = useMemo(() => {
    const blockedByIds = ticket.blockedBy || []
    return blockedByIds
      .map(id => allTickets.find(t => t.id === id))
      .filter((t): t is Ticket => t !== undefined)
  }, [ticket.blockedBy, allTickets])

  const blocksTickets = useMemo(() => {
    const blocksIds = ticket.blocks || []
    return blocksIds
      .map(id => allTickets.find(t => t.id === id))
      .filter((t): t is Ticket => t !== undefined)
  }, [ticket.blocks, allTickets])

  const availableForBlockedBy = useMemo(() => {
    const blockedByIds = new Set(ticket.blockedBy || [])
    return allTickets.filter(t => 
      t.id !== ticket.id && 
      !blockedByIds.has(t.id) &&
      t.status !== 'done' && 
      t.status !== 'approved'
    )
  }, [ticket, allTickets])

  const availableForBlocks = useMemo(() => {
    const blocksIds = new Set(ticket.blocks || [])
    return allTickets.filter(t => 
      t.id !== ticket.id && 
      !blocksIds.has(t.id) &&
      t.status !== 'done' && 
      t.status !== 'approved'
    )
  }, [ticket, allTickets])

  const handleAddBlockedBy = useCallback(async () => {
    if (!selectedBlockedBy || !onAddDependency) return

    const circularCheck = detectCircularDependency(allTickets, ticket.id, selectedBlockedBy)
    if (circularCheck.hasCircle) {
      toast.error('Cannot add dependency', {
        description: `This would create a circular dependency: ${circularCheck.chain.join(' → ')}`
      })
      return
    }

    setIsSubmitting(true)
    try {
      await onAddDependency(ticket.id, selectedBlockedBy, 'blockedBy')
      toast.success('Dependency added')
      setSelectedBlockedBy('')
      setIsAddingBlockedBy(false)
    } catch (err) {
      toast.error('Failed to add dependency', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedBlockedBy, onAddDependency, ticket.id, allTickets])

  const handleAddBlocks = useCallback(async () => {
    if (!selectedBlocks || !onAddDependency) return

    const circularCheck = detectCircularDependency(allTickets, selectedBlocks, ticket.id)
    if (circularCheck.hasCircle) {
      toast.error('Cannot add dependency', {
        description: `This would create a circular dependency: ${circularCheck.chain.join(' → ')}`
      })
      return
    }

    setIsSubmitting(true)
    try {
      await onAddDependency(ticket.id, selectedBlocks, 'blocks')
      toast.success('Dependency added')
      setSelectedBlocks('')
      setIsAddingBlocks(false)
    } catch (err) {
      toast.error('Failed to add dependency', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedBlocks, onAddDependency, ticket.id, allTickets])

  const handleRemoveBlockedBy = useCallback(async (dependencyId: string) => {
    if (!onRemoveDependency) return

    setIsSubmitting(true)
    try {
      await onRemoveDependency(ticket.id, dependencyId, 'blockedBy')
      toast.success('Dependency removed')
    } catch (err) {
      toast.error('Failed to remove dependency', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [onRemoveDependency, ticket.id])

  const handleRemoveBlocks = useCallback(async (dependencyId: string) => {
    if (!onRemoveDependency) return

    setIsSubmitting(true)
    try {
      await onRemoveDependency(ticket.id, dependencyId, 'blocks')
      toast.success('Dependency removed')
    } catch (err) {
      toast.error('Failed to remove dependency', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [onRemoveDependency, ticket.id])

  return (
    <div className="space-y-4">
      {/* Blocked By Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs font-medium text-muted">Blocked By</span>
            {blockedByTickets.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                {blockedByTickets.length}
              </Badge>
            )}
          </div>
          {!disabled && onAddDependency && !isAddingBlockedBy && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs"
              onClick={() => setIsAddingBlockedBy(true)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>

        {isAddingBlockedBy && (
          <div className="flex items-center gap-2 mb-2">
            <Select value={selectedBlockedBy} onValueChange={setSelectedBlockedBy}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder="Select ticket..." />
              </SelectTrigger>
              <SelectContent>
                {availableForBlockedBy.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    <span className="truncate max-w-[200px]">{t.title}</span>
                  </SelectItem>
                ))}
                {availableForBlockedBy.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted">No available tickets</div>
                )}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              onClick={handleAddBlockedBy}
              disabled={!selectedBlockedBy || isSubmitting}
            >
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setIsAddingBlockedBy(false)
                setSelectedBlockedBy('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {blockedByTickets.length > 0 ? (
          <div className="space-y-1">
            {blockedByTickets.map(dep => (
              <div
                key={dep.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2 bg-secondary/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 shrink-0"
                    style={{
                      color: STATUS_COLORS[dep.status],
                      borderColor: STATUS_COLORS[dep.status],
                    }}
                  >
                    {dep.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-foreground truncate">{dep.title}</span>
                </div>
                {!disabled && onRemoveDependency && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleRemoveBlockedBy(dep.id)}
                    disabled={isSubmitting}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted italic">No blocking dependencies</p>
        )}
      </div>

      {/* Blocks Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Unlock className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs font-medium text-muted">Blocks</span>
            {blocksTickets.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                {blocksTickets.length}
              </Badge>
            )}
          </div>
          {!disabled && onAddDependency && !isAddingBlocks && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs"
              onClick={() => setIsAddingBlocks(true)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>

        {isAddingBlocks && (
          <div className="flex items-center gap-2 mb-2">
            <Select value={selectedBlocks} onValueChange={setSelectedBlocks}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder="Select ticket..." />
              </SelectTrigger>
              <SelectContent>
                {availableForBlocks.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    <span className="truncate max-w-[200px]">{t.title}</span>
                  </SelectItem>
                ))}
                {availableForBlocks.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted">No available tickets</div>
                )}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              onClick={handleAddBlocks}
              disabled={!selectedBlocks || isSubmitting}
            >
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setIsAddingBlocks(false)
                setSelectedBlocks('')
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {blocksTickets.length > 0 ? (
          <div className="space-y-1">
            {blocksTickets.map(dep => (
              <div
                key={dep.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2 bg-secondary/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 shrink-0"
                    style={{
                      color: STATUS_COLORS[dep.status],
                      borderColor: STATUS_COLORS[dep.status],
                    }}
                  >
                    {dep.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-foreground truncate">{dep.title}</span>
                </div>
                {!disabled && onRemoveDependency && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleRemoveBlocks(dep.id)}
                    disabled={isSubmitting}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted italic">Not blocking any tickets</p>
        )}
      </div>
    </div>
  )
}

interface DependencyVisualizationProps {
  tickets: Ticket[]
  selectedTicketId?: string
  onTicketSelect?: (ticketId: string) => void
}

interface NodePosition {
  x: number
  y: number
  width: number
  height: number
}

export function DependencyVisualization({
  tickets,
  selectedTicketId,
  onTicketSelect,
}: DependencyVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [expanded, setExpanded] = useState(true)

  const graph = useMemo(() => buildDependencyGraph(tickets), [tickets])

  const sortedTickets = useMemo(() => {
    const sorted: Ticket[][] = []
    const visited = new Set<string>()

    const nodesByDepth = new Map<number, Ticket[]>()
    for (const [id, node] of graph.nodes) {
      const depth = node.depth
      if (!nodesByDepth.has(depth)) {
        nodesByDepth.set(depth, [])
      }
      nodesByDepth.get(depth)!.push(node.ticket)
    }

    const maxDepth = Math.max(...Array.from(nodesByDepth.keys()), 0)
    for (let d = 0; d <= maxDepth; d++) {
      sorted.push(nodesByDepth.get(d) || [])
    }

    return sorted
  }, [graph])

  useEffect(() => {
    if (!containerRef.current) return

    const positions = new Map<string, NodePosition>()
    const nodes = containerRef.current.querySelectorAll('[data-ticket-id]')
    const containerRect = containerRef.current.getBoundingClientRect()

    nodes.forEach(node => {
      const ticketId = node.getAttribute('data-ticket-id')
      if (ticketId) {
        const rect = node.getBoundingClientRect()
        positions.set(ticketId, {
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
        })
      }
    })

    setNodePositions(positions)
  }, [sortedTickets, expanded])

  const connections = useMemo(() => {
    const lines: { from: string; to: string; isBlocked: boolean }[] = []

    for (const ticket of tickets) {
      const blockedBy = ticket.blockedBy || []
      for (const depId of blockedBy) {
        const fromPos = nodePositions.get(depId)
        const toPos = nodePositions.get(ticket.id)
        if (fromPos && toPos) {
          const depTicket = tickets.find(t => t.id === depId)
          const isBlocked = depTicket ? depTicket.status !== 'done' && depTicket.status !== 'approved' : false
          lines.push({ from: depId, to: ticket.id, isBlocked })
        }
      }
    }

    return lines
  }, [tickets, nodePositions])

  if (tickets.length === 0) {
    return (
      <div className="text-center py-8">
        <GitBranch className="h-8 w-8 text-muted mx-auto mb-2" />
        <p className="text-sm text-muted">No tickets to visualize</p>
      </div>
    )
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Dependency Graph
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
        {graph.hasCircularDependency && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/30">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs text-red-500">
              Circular dependency detected: {graph.circularChain.map(id => {
                const t = tickets.find(t => t.id === id)
                return t?.title || id
              }).join(' → ')}
            </span>
          </div>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div ref={containerRef} className="relative min-h-[200px]">
            {/* SVG for connection lines */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              {connections.map(({ from, to, isBlocked }, idx) => {
                const fromPos = nodePositions.get(from)
                const toPos = nodePositions.get(to)
                if (!fromPos || !toPos) return null

                const startX = fromPos.x
                const startY = fromPos.y + fromPos.height / 2
                const endX = toPos.x
                const endY = toPos.y - toPos.height / 2

                const midY = (startY + endY) / 2

                return (
                  <g key={idx}>
                    <path
                      d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                      fill="none"
                      stroke={isBlocked ? '#ef4444' : '#22c55e'}
                      strokeWidth={2}
                      strokeDasharray={isBlocked ? '4 2' : 'none'}
                      opacity={0.6}
                    />
                    <polygon
                      points={`${endX},${endY} ${endX - 4},${endY - 8} ${endX + 4},${endY - 8}`}
                      fill={isBlocked ? '#ef4444' : '#22c55e'}
                      opacity={0.6}
                    />
                  </g>
                )
              })}
            </svg>

            {/* Ticket nodes by depth */}
            <div className="space-y-4">
              {sortedTickets.map((depthTickets, depth) => (
                <div key={depth} className="flex flex-wrap gap-2 justify-center">
                  {depthTickets.map(ticket => {
                    const node = graph.nodes.get(ticket.id)
                    const isSelected = ticket.id === selectedTicketId
                    const isOnCriticalPath = node?.isOnCriticalPath || false

                    return (
                      <div
                        key={ticket.id}
                        data-ticket-id={ticket.id}
                        className={`
                          px-3 py-2 rounded-md border cursor-pointer transition-all
                          ${isSelected ? 'ring-2 ring-primary' : ''}
                          ${isOnCriticalPath ? 'border-amber-500' : 'border-border'}
                          ${node?.isBlocked ? 'bg-red-500/10' : 'bg-secondary/50'}
                          hover:bg-secondary
                        `}
                        onClick={() => onTicketSelect?.(ticket.id)}
                      >
                        <div className="flex items-center gap-2">
                          {node?.isBlocked && <Lock className="h-3 w-3 text-red-500" />}
                          <span className="text-xs font-medium truncate max-w-[150px]">
                            {ticket.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge
                            variant="outline"
                            className="text-[8px] px-1"
                            style={{
                              color: STATUS_COLORS[ticket.status],
                              borderColor: STATUS_COLORS[ticket.status],
                            }}
                          >
                            {ticket.status.replace('_', ' ')}
                          </Badge>
                          {isOnCriticalPath && (
                            <Badge variant="outline" className="text-[8px] px-1 text-amber-500 border-amber-500">
                              critical
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-green-500" />
              <span className="text-[10px] text-muted">Resolved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-red-500" style={{ strokeDasharray: '4 2' }} />
              <span className="text-[10px] text-muted">Blocking</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-red-500" />
              <span className="text-[10px] text-muted">Blocked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded border border-amber-500" />
              <span className="text-[10px] text-muted">Critical Path</span>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

interface DependencySelectorProps {
  tickets: Ticket[]
  currentTicketId?: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
  type: 'blockedBy' | 'blocks'
  disabled?: boolean
}

export function DependencySelector({
  tickets,
  currentTicketId,
  selectedIds,
  onChange,
  type,
  disabled = false,
}: DependencySelectorProps) {
  const availableTickets = useMemo(() => {
    return tickets.filter(t => 
      t.id !== currentTicketId && 
      !selectedIds.includes(t.id)
    )
  }, [tickets, currentTicketId, selectedIds])

  const selectedTickets = useMemo(() => {
    return selectedIds
      .map(id => tickets.find(t => t.id === id))
      .filter((t): t is Ticket => t !== undefined)
  }, [selectedIds, tickets])

  const handleAdd = useCallback((ticketId: string) => {
    if (currentTicketId) {
      const checkId = type === 'blockedBy' ? currentTicketId : ticketId
      const depId = type === 'blockedBy' ? ticketId : currentTicketId
      const circularCheck = detectCircularDependency(tickets, checkId, depId)
      if (circularCheck.hasCircle) {
        toast.error('Cannot add dependency', {
          description: 'This would create a circular dependency'
        })
        return
      }
    }
    onChange([...selectedIds, ticketId])
  }, [currentTicketId, selectedIds, onChange, tickets, type])

  const handleRemove = useCallback((ticketId: string) => {
    onChange(selectedIds.filter(id => id !== ticketId))
  }, [selectedIds, onChange])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {type === 'blockedBy' ? (
          <Lock className="h-3.5 w-3.5 text-muted" />
        ) : (
          <Unlock className="h-3.5 w-3.5 text-muted" />
        )}
        <span className="text-xs font-medium text-muted">
          {type === 'blockedBy' ? 'Blocked By' : 'Blocks'}
        </span>
      </div>

      {selectedTickets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTickets.map(ticket => (
            <Badge
              key={ticket.id}
              variant="secondary"
              className="text-[10px] gap-1 pr-1"
            >
              {ticket.title.slice(0, 20)}{ticket.title.length > 20 ? '...' : ''}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(ticket.id)}
                  className="ml-1 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && availableTickets.length > 0 && (
        <Select onValueChange={handleAdd}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={`Add ${type === 'blockedBy' ? 'blocker' : 'blocked ticket'}...`} />
          </SelectTrigger>
          <SelectContent>
            {availableTickets.map(ticket => (
              <SelectItem key={ticket.id} value={ticket.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[8px] px-1"
                    style={{
                      color: STATUS_COLORS[ticket.status],
                      borderColor: STATUS_COLORS[ticket.status],
                    }}
                  >
                    {ticket.status.replace('_', ' ')}
                  </Badge>
                  <span className="truncate max-w-[180px]">{ticket.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedTickets.length === 0 && (
        <p className="text-xs text-muted italic">
          {type === 'blockedBy' ? 'No blocking dependencies' : 'Not blocking any tickets'}
        </p>
      )}
    </div>
  )
}
