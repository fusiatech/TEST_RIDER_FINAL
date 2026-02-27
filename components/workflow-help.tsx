'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Eye,
  Archive,
  AlertTriangle,
} from 'lucide-react'

interface WorkflowStatus {
  id: string
  label: string
  description: string
  color: string
  icon: typeof Clock
  nextStates: string[]
}

const WORKFLOW_STATUSES: WorkflowStatus[] = [
  {
    id: 'backlog',
    label: 'Backlog',
    description: 'Tasks waiting to be started. These are planned but not yet being worked on by the AI.',
    color: '#71717a',
    icon: Archive,
    nextStates: ['in_progress'],
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    description: 'Tasks currently being worked on by the AI agents. The AI is actively writing code or researching.',
    color: '#3b82f6',
    icon: Play,
    nextStates: ['review', 'backlog'],
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Tasks that are done but need someone to check and approve the work. You can approve or reject.',
    color: '#eab308',
    icon: Eye,
    nextStates: ['done', 'rejected'],
  },
  {
    id: 'done',
    label: 'Done',
    description: 'Tasks that have been completed and approved. The work is finished and accepted.',
    color: '#22c55e',
    icon: CheckCircle2,
    nextStates: [],
  },
  {
    id: 'rejected',
    label: 'Rejected',
    description: 'Tasks that were reviewed but need changes. They will be reworked and submitted again.',
    color: '#ef4444',
    icon: XCircle,
    nextStates: ['in_progress', 'backlog'],
  },
]

function WorkflowDiagram() {
  const [hoveredStatus, setHoveredStatus] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Visual Flow Diagram */}
      <div className="relative p-6 bg-secondary/30 rounded-lg">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {WORKFLOW_STATUSES.map((status, index) => {
            const StatusIcon = status.icon
            const isHovered = hoveredStatus === status.id
            const isTarget = hoveredStatus && WORKFLOW_STATUSES.find(s => s.id === hoveredStatus)?.nextStates.includes(status.id)
            
            return (
              <div key={status.id} className="flex items-center gap-2">
                <div
                  className={`relative flex flex-col items-center p-3 rounded-lg border-2 transition-all cursor-pointer ${
                    isHovered ? 'scale-105 shadow-lg' : ''
                  } ${isTarget ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  style={{
                    borderColor: status.color,
                    backgroundColor: isHovered ? `${status.color}20` : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredStatus(status.id)}
                  onMouseLeave={() => setHoveredStatus(null)}
                >
                  <StatusIcon
                    className="h-6 w-6 mb-1"
                    style={{ color: status.color }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: status.color }}
                  >
                    {status.label}
                  </span>
                  {status.nextStates.length > 0 && isHovered && (
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-muted whitespace-nowrap">
                      Can go to: {status.nextStates.map(s => 
                        WORKFLOW_STATUSES.find(ws => ws.id === s)?.label
                      ).join(', ')}
                    </div>
                  )}
                </div>
                {index < WORKFLOW_STATUSES.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Status Explanations */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">What each status means:</h4>
        {WORKFLOW_STATUSES.map((status) => {
          const StatusIcon = status.icon
          return (
            <div
              key={status.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-secondary/30 transition-colors"
            >
              <div
                className="p-2 rounded-lg shrink-0"
                style={{ backgroundColor: `${status.color}20` }}
              >
                <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-foreground">{status.label}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={{ color: status.color, borderColor: status.color }}
                  >
                    {status.id.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-sm text-muted">{status.description}</p>
                {status.nextStates.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted">
                    <ArrowRight className="h-3 w-3" />
                    <span>
                      Can move to:{' '}
                      {status.nextStates.map((s, i) => (
                        <span key={s}>
                          <span
                            className="font-medium"
                            style={{ color: WORKFLOW_STATUSES.find(ws => ws.id === s)?.color }}
                          >
                            {WORKFLOW_STATUSES.find(ws => ws.id === s)?.label}
                          </span>
                          {i < status.nextStates.length - 1 && ', '}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tips Section */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-foreground mb-1">Tips for reviewing tasks</h4>
            <ul className="text-xs text-muted space-y-1">
              <li>• Check the &quot;Proof&quot; tab to see what changes were made</li>
              <li>• Look at the acceptance criteria to verify all requirements are met</li>
              <li>• Add a comment when approving or rejecting to explain your decision</li>
              <li>• Rejected tasks go back to be reworked - they&apos;re not deleted</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WorkflowHelpButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted hover:text-foreground">
          <HelpCircle className="h-4 w-4" />
          <span className="hidden sm:inline">How it works</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Ticket Workflow Guide
          </DialogTitle>
          <DialogDescription>
            Learn how tickets move through the system from start to finish
          </DialogDescription>
        </DialogHeader>
        <WorkflowDiagram />
      </DialogContent>
    </Dialog>
  )
}

export function WorkflowHelpCard() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            Workflow Guide
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent>
          <WorkflowDiagram />
        </CardContent>
      )}
    </Card>
  )
}
