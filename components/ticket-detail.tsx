'use client'

import { useState } from 'react'
import type { Ticket } from '@/lib/types'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSwarmStore } from '@/lib/store'
import { X, Check, Clock, Tag, GitBranch, FileText, Shield, TestTube2, RotateCcw, Terminal } from 'lucide-react'

const MAX_TRUNCATE = 2000
function truncate(text: string, max = MAX_TRUNCATE): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '\n\n… truncated'
}

function ProofTab({ ticket }: { ticket: Ticket }) {
  const entries: { diff?: string; cliExcerpts?: string }[] = []
  if (ticket.diff || ticket.output) entries.push({ diff: ticket.diff, cliExcerpts: ticket.output })
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Evidence (read-only)</span>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => {}} title="Re-run pipeline (placeholder)">
          <RotateCcw className="h-3.5 w-3.5" /> Re-run
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">No evidence yet. Evidence will appear here when Phase 8 is implemented.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((e, i) => (
            <div key={i} className="rounded-md border border-border p-3 space-y-2">
              {e.diff && <div><span className="text-[10px] font-medium text-muted">Diff</span><pre className="mt-0.5 rounded bg-secondary/50 p-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{truncate(e.diff)}</pre></div>}
              {e.cliExcerpts && <div><span className="flex items-center gap-1 text-[10px] font-medium text-muted"><Terminal className="h-3 w-3" /> CLI excerpts</span><pre className="mt-0.5 rounded bg-secondary/50 p-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{truncate(e.cliExcerpts)}</pre></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface TicketDetailProps {
  ticket: Ticket
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  backlog: '#71717a',
  in_progress: '#3b82f6',
  review: '#eab308',
  approved: '#22c55e',
  done: '#22c55e',
  rejected: '#ef4444',
}

const COMPLEXITY_COLORS: Record<string, string> = {
  S: '#22c55e',
  M: '#3b82f6',
  L: '#f59e0b',
  XL: '#ef4444',
}

export function TicketDetail({ ticket, onClose }: TicketDetailProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'proof'>('details')
  const approveTicket = useSwarmStore((s) => s.approveTicket)
  const rejectTicket = useSwarmStore((s) => s.rejectTicket)
  const isReview = ticket.status === 'review'

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold text-foreground">
              {ticket.title}
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5"
                style={{
                  color: STATUS_COLORS[ticket.status],
                  borderColor: STATUS_COLORS[ticket.status],
                }}
              >
                {ticket.status.replace('_', ' ')}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5"
                style={{
                  color: COMPLEXITY_COLORS[ticket.complexity],
                  borderColor: COMPLEXITY_COLORS[ticket.complexity],
                }}
              >
                {ticket.complexity}
              </Badge>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5"
                style={{
                  color: ROLE_COLORS[ticket.assignedRole],
                  borderColor: ROLE_COLORS[ticket.assignedRole],
                }}
              >
                {ROLE_LABELS[ticket.assignedRole]}
              </Badge>
              {ticket.confidence != null && (
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {ticket.confidence}% confidence
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 flex gap-1 border-b border-border">
          <button onClick={() => setActiveTab('details')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md ${activeTab === 'details' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>Details</button>
          <button onClick={() => setActiveTab('proof')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md ${activeTab === 'proof' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>Proof</button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeTab === 'proof' ? <ProofTab ticket={ticket} /> : (
        <>
        {ticket.description && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Description</span>
            </div>
            <p className="text-sm text-foreground">{ticket.description}</p>
          </div>
        )}

        {ticket.acceptanceCriteria.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Check className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">
                Acceptance Criteria
              </span>
            </div>
            <ul className="space-y-1">
              {ticket.acceptanceCriteria.map((criterion, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {criterion}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ticket.dependencies.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <GitBranch className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Dependencies</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {ticket.dependencies.map((dep) => (
                <Badge key={dep} variant="secondary" className="text-[10px]">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {ticket.output && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <Tag className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Output</span>
            </div>
            <pre className="rounded-md bg-secondary/50 p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
              {ticket.output}
            </pre>
          </div>
        )}

        {ticket.diff && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <GitBranch className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Diff</span>
            </div>
            <pre className="rounded-md bg-secondary/50 p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
              {ticket.diff}
            </pre>
          </div>
        )}

        {ticket.testResults && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <TestTube2 className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">Test Results</span>
            </div>
            <pre className="rounded-md bg-secondary/50 p-3 text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
              {ticket.testResults}
            </pre>
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted pt-2">
          <Clock className="h-3 w-3" />
          <span>
            Created {new Date(ticket.createdAt).toLocaleString()}
          </span>
          {ticket.updatedAt !== ticket.createdAt && (
            <>
              <span className="text-border">|</span>
              <span>
                Updated {new Date(ticket.updatedAt).toLocaleString()}
              </span>
            </>
          )}
        </div>

        {isReview && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 flex-1 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
              onClick={() => approveTicket(ticket.id)}
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 flex-1 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
              onClick={() => rejectTicket(ticket.id)}
            >
              <Shield className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  )
}
