'use client'

import { useMemo, useState } from 'react'
import { useSwarmStore } from '@/lib/store'
import type { Ticket, TicketComplexity, TicketStatus, AgentRole, Project } from '@/lib/types'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TicketDetail } from '@/components/ticket-detail'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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
} from 'lucide-react'

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
            <CardTitle className="text-sm font-medium">Product Requirements Document</CardTitle>
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

function TicketCard({
  ticket,
  onClick,
}: {
  ticket: Ticket
  onClick: () => void
}) {
  const approveTicket = useSwarmStore((s) => s.approveTicket)
  const rejectTicket = useSwarmStore((s) => s.rejectTicket)
  const RoleIcon = ROLE_ICONS[ticket.assignedRole]
  const isReview = ticket.status === 'review'

  return (
    <Card
      className="border-border bg-card/80 cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-foreground line-clamp-1">{ticket.title}</span>
          <Badge
            variant="outline"
            className="shrink-0 text-[10px] px-1.5"
            style={{ color: COMPLEXITY_COLORS[ticket.complexity], borderColor: COMPLEXITY_COLORS[ticket.complexity] }}
          >
            {ticket.complexity}
          </Badge>
        </div>
        {ticket.description && (
          <p className="text-xs text-muted line-clamp-2">{ticket.description}</p>
        )}
        <div className="flex items-center gap-2">
          <RoleIcon className="h-3.5 w-3.5" style={{ color: ROLE_COLORS[ticket.assignedRole] }} />
          <span className="text-xs text-muted">{ROLE_LABELS[ticket.assignedRole]}</span>
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

export function ProjectDashboard() {
  const tickets = useSwarmStore((s) => s.tickets)
  const projects = useSwarmStore((s) => s.projects)
  const currentProjectId = useSwarmStore((s) => s.currentProjectId)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  const currentProject = projects.find((p) => p.id === currentProjectId)

  const allTickets = useMemo(() => {
    if (currentProject && currentProject.tickets.length > 0) {
      return currentProject.tickets
    }
    return tickets
  }, [currentProject, tickets])

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

  const setMode = useSwarmStore((s) => s.setMode)

  if (allTickets.length === 0 && !currentProject?.prd) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-3xl bg-primary/5 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <ClipboardList className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-foreground">No project tickets yet</h3>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Describe a project to automatically decompose it into tickets and track progress on this dashboard.
        </p>
        <Button
          variant="outline"
          className="mt-4 gap-2"
          onClick={() => setMode('project')}
        >
          <Sparkles className="h-4 w-4" />
          Create Project
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* PRD Section */}
      {currentProject && <PRDSection project={currentProject} />}

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
            <span className="text-xs text-muted">Avg Confidence</span>
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
                      <div className="flex-1 rounded-lg border border-border p-2.5 transition-all">
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

      {/* Kanban Board */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {BOARD_COLUMNS.map((col) => {
          const colTickets = allTickets.filter((t) => t.status === col.status)
          const isRejected = col.status === 'rejected'
          const isCollapsed = isRejected && !rejectedExpanded

          return (
            <div key={col.status}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                  <h4 className="text-sm font-medium text-foreground">{col.label}</h4>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">{colTickets.length}</Badge>
                  {isRejected && colTickets.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setRejectedExpanded(!rejectedExpanded)}
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
                <div className="space-y-2 min-h-[100px]">
                  {colTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onClick={() =>
                        setSelectedTicketId(
                          selectedTicketId === ticket.id ? null : ticket.id
                        )
                      }
                    />
                  ))}
                  {colTickets.length === 0 && (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border">
                      <span className="text-xs text-muted">No tickets</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Ticket Detail */}
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </div>
  )
}
