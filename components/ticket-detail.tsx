'use client'

import { useState, useCallback, useMemo } from 'react'
import type { Ticket, ApprovalHistoryEntry, TicketAttachment, FigmaLink, TicketLevel } from '@/lib/types'
import { ROLE_COLORS, ROLE_LABELS } from '@/lib/types'
import { AttachmentUpload } from '@/components/attachment-upload'
import { FigmaLinks } from '@/components/figma-link'
import { SLASummaryCard } from '@/components/sla-badge'
import { CompactAISummary } from '@/components/ai-summary'
import { TicketDependencies } from '@/components/ticket-dependencies'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSwarmStore } from '@/lib/store'
import { Tooltip, TERM_DEFINITIONS, ROLE_DESCRIPTIONS, COMPLEXITY_DESCRIPTIONS } from '@/components/ui/tooltip'
import { checkSLAStatus, getDefaultPriorityFromComplexity } from '@/lib/sla-calculator'
import { toast } from 'sonner'
import { 
  X, Check, Clock, Tag, GitBranch, FileText, Shield, TestTube2, RotateCcw, Terminal,
  Edit2, Save, XCircle, Plus, Trash2, MessageSquare, History, User, Paperclip, Figma, Link2,
  ArrowUp, ChevronRight
} from 'lucide-react'

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
  allTickets?: Ticket[]
  onClose: () => void
  onUpdate?: (ticketId: string, updates: Partial<Ticket>) => Promise<void>
  onAddDependency?: (ticketId: string, dependencyId: string, type: 'blockedBy' | 'blocks') => Promise<void>
  onRemoveDependency?: (ticketId: string, dependencyId: string, type: 'blockedBy' | 'blocks') => Promise<void>
  onSelectTicket?: (ticketId: string) => void
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

const LEVEL_COLORS: Record<TicketLevel, string> = {
  feature: '#a855f7',
  epic: '#3b82f6',
  story: '#22c55e',
  task: '#eab308',
  subtask: '#f97316',
  subatomic: '#ef4444',
}

export function TicketDetail({ ticket, allTickets = [], onClose, onUpdate, onAddDependency, onRemoveDependency, onSelectTicket }: TicketDetailProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'proof' | 'history' | 'attachments' | 'design' | 'dependencies'>('details')
  const [attachments, setAttachments] = useState<TicketAttachment[]>(ticket.attachments || [])
  const [figmaLinks, setFigmaLinks] = useState<FigmaLink[]>(ticket.figmaLinks || [])
  const [aiSummary, setAiSummary] = useState<string | undefined>(ticket.aiSummary)
  
  const slaStatus = useMemo(() => {
    const priority = ticket.sla?.priority || getDefaultPriorityFromComplexity(ticket.complexity)
    return checkSLAStatus(
      ticket.createdAt,
      ticket.firstResponseAt,
      ticket.resolvedAt,
      priority
    )
  }, [ticket.createdAt, ticket.firstResponseAt, ticket.resolvedAt, ticket.sla?.priority, ticket.complexity])

  const parentTicket = useMemo(() => {
    if (!ticket.parentId) return null
    return allTickets.find(t => t.id === ticket.parentId) || null
  }, [ticket.parentId, allTickets])

  const childTickets = useMemo(() => {
    return allTickets.filter(t => t.parentId === ticket.id)
  }, [ticket.id, allTickets])
  const approveTicket = useSwarmStore((s) => s.approveTicket)
  const rejectTicket = useSwarmStore((s) => s.rejectTicket)
  const isReview = ticket.status === 'review'
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(ticket.title)
  const [editDescription, setEditDescription] = useState(ticket.description || '')
  const [editCriteria, setEditCriteria] = useState<string[]>([...ticket.acceptanceCriteria])
  const [isSaving, setIsSaving] = useState(false)
  
  // Approval comment state
  const [showApprovalComment, setShowApprovalComment] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null)
  
  const handleStartEdit = useCallback(() => {
    setEditTitle(ticket.title)
    setEditDescription(ticket.description || '')
    setEditCriteria([...ticket.acceptanceCriteria])
    setIsEditing(true)
  }, [ticket])
  
  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    setEditTitle(ticket.title)
    setEditDescription(ticket.description || '')
    setEditCriteria([...ticket.acceptanceCriteria])
  }, [ticket])
  
  const handleSaveEdit = useCallback(async () => {
    if (!editTitle.trim()) {
      toast.error('Title is required')
      return
    }
    
    setIsSaving(true)
    try {
      if (onUpdate) {
        await onUpdate(ticket.id, {
          title: editTitle.trim(),
          description: editDescription.trim() || undefined,
          acceptanceCriteria: editCriteria.filter(c => c.trim()),
        })
        toast.success('Ticket updated')
      }
      setIsEditing(false)
    } catch (err) {
      toast.error('Failed to save changes', {
        description: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      setIsSaving(false)
    }
  }, [ticket.id, editTitle, editDescription, editCriteria, onUpdate])
  
  const handleAddCriterion = useCallback(() => {
    setEditCriteria(prev => [...prev, ''])
  }, [])
  
  const handleRemoveCriterion = useCallback((index: number) => {
    setEditCriteria(prev => prev.filter((_, i) => i !== index))
  }, [])
  
  const handleUpdateCriterion = useCallback((index: number, value: string) => {
    setEditCriteria(prev => prev.map((c, i) => i === index ? value : c))
  }, [])
  
  const handleApprovalAction = useCallback((action: 'approve' | 'reject') => {
    setApprovalAction(action)
    setShowApprovalComment(true)
    setApprovalComment('')
  }, [])
  
  const handleSubmitApproval = useCallback(async () => {
    if (!approvalAction) return
    
    const historyEntry: ApprovalHistoryEntry = {
      action: approvalAction === 'approve' ? 'approved' : 'rejected',
      timestamp: Date.now(),
      comment: approvalComment.trim() || undefined,
      user: 'User',
    }
    
    if (onUpdate) {
      const existingHistory = ticket.approvalHistory || []
      await onUpdate(ticket.id, {
        approvalHistory: [...existingHistory, historyEntry],
      })
    }
    
    if (approvalAction === 'approve') {
      approveTicket(ticket.id)
      toast.success('Ticket approved')
    } else {
      rejectTicket(ticket.id)
      toast.success('Ticket rejected')
    }
    
    setShowApprovalComment(false)
    setApprovalComment('')
    setApprovalAction(null)
  }, [approvalAction, approvalComment, ticket.id, ticket.approvalHistory, onUpdate, approveTicket, rejectTicket])
  
  const handleCancelApproval = useCallback(() => {
    setShowApprovalComment(false)
    setApprovalComment('')
    setApprovalAction(null)
  }, [])

  const handleAttachmentAdded = useCallback((attachment: TicketAttachment) => {
    const newAttachments = [...attachments, attachment]
    setAttachments(newAttachments)
    if (onUpdate) {
      onUpdate(ticket.id, { attachments: newAttachments })
    }
  }, [attachments, ticket.id, onUpdate])

  const handleAttachmentRemoved = useCallback((attachmentId: string) => {
    const newAttachments = attachments.filter((a) => a.id !== attachmentId)
    setAttachments(newAttachments)
    if (onUpdate) {
      onUpdate(ticket.id, { attachments: newAttachments })
    }
  }, [attachments, ticket.id, onUpdate])

  const handleFigmaLinkAdded = useCallback((link: FigmaLink) => {
    const newLinks = [...figmaLinks, link]
    setFigmaLinks(newLinks)
    if (onUpdate) {
      onUpdate(ticket.id, { figmaLinks: newLinks })
    }
  }, [figmaLinks, ticket.id, onUpdate])

  const handleFigmaLinkRemoved = useCallback((linkId: string) => {
    const newLinks = figmaLinks.filter((l) => l.id !== linkId)
    setFigmaLinks(newLinks)
    if (onUpdate) {
      onUpdate(ticket.id, { figmaLinks: newLinks })
    }
  }, [figmaLinks, ticket.id, onUpdate])

  const handleAiSummaryGenerated = useCallback((summary: string) => {
    setAiSummary(summary)
    if (onUpdate) {
      onUpdate(ticket.id, { aiSummary: summary })
    }
  }, [ticket.id, onUpdate])

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Ticket title"
                className="text-base font-semibold"
              />
            ) : (
              <CardTitle className="text-base font-semibold text-foreground">
                {ticket.title}
              </CardTitle>
            )}
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
              <Tooltip content={COMPLEXITY_DESCRIPTIONS[ticket.complexity]}>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 cursor-help"
                  style={{
                    color: COMPLEXITY_COLORS[ticket.complexity],
                    borderColor: COMPLEXITY_COLORS[ticket.complexity],
                  }}
                >
                  {ticket.complexity}
                </Badge>
              </Tooltip>
              <Tooltip content={ROLE_DESCRIPTIONS[ticket.assignedRole]}>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 cursor-help"
                  style={{
                    color: ROLE_COLORS[ticket.assignedRole],
                    borderColor: ROLE_COLORS[ticket.assignedRole],
                  }}
                >
                  {ROLE_LABELS[ticket.assignedRole]}
                </Badge>
              </Tooltip>
              {ticket.confidence != null && (
                <Tooltip content={TERM_DEFINITIONS.Confidence}>
                  <Badge variant="secondary" className="text-[10px] px-1.5 cursor-help">
                    {ticket.confidence}% confidence
                  </Badge>
                </Tooltip>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isEditing && onUpdate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleStartEdit}
                title="Edit ticket"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {isEditing && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-green-500 hover:text-green-400"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  title="Save changes"
                >
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-400"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  title="Cancel editing"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-1 border-b border-border">
          <button onClick={() => setActiveTab('details')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md ${activeTab === 'details' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>Details</button>
          <button onClick={() => setActiveTab('proof')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md ${activeTab === 'proof' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>Proof</button>
          <button onClick={() => setActiveTab('history')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md flex items-center gap-1 ${activeTab === 'history' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>
            <History className="h-3 w-3" />
            History
            {ticket.approvalHistory && ticket.approvalHistory.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{ticket.approvalHistory.length}</Badge>
            )}
          </button>
          <button onClick={() => setActiveTab('attachments')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md flex items-center gap-1 ${activeTab === 'attachments' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>
            <Paperclip className="h-3 w-3" />
            Attachments
            {attachments.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{attachments.length}</Badge>
            )}
          </button>
          <button onClick={() => setActiveTab('design')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md flex items-center gap-1 ${activeTab === 'design' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>
            <Figma className="h-3 w-3" />
            Design
            {figmaLinks.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{figmaLinks.length}</Badge>
            )}
          </button>
          <button onClick={() => setActiveTab('dependencies')} className={`px-3 py-1.5 text-xs font-medium rounded-t-md flex items-center gap-1 ${activeTab === 'dependencies' ? 'bg-secondary text-foreground border border-b-0 border-border -mb-px' : 'text-muted hover:text-foreground'}`}>
            <Link2 className="h-3 w-3" />
            Dependencies
            {((ticket.blockedBy?.length || 0) + (ticket.blocks?.length || 0)) > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{(ticket.blockedBy?.length || 0) + (ticket.blocks?.length || 0)}</Badge>
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Parent/Child Navigation */}
        {(ticket.parentId || childTickets.length > 0) && activeTab === 'details' && (
          <div className="space-y-3 pb-3 border-b border-border">
            {/* View Parent Link */}
            {ticket.parentId && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <ArrowUp className="h-4 w-4" />
                <button
                  onClick={() => onSelectTicket?.(ticket.parentId!)}
                  className="hover:text-foreground hover:underline transition-colors"
                >
                  View Parent Ticket
                  {parentTicket && (
                    <span className="ml-1 text-muted">
                      ({parentTicket.title.slice(0, 30)}{parentTicket.title.length > 30 ? '...' : ''})
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Child Tickets Section */}
            {childTickets.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-muted" />
                  Child Tickets ({childTickets.length})
                </h4>
                <div className="space-y-1 pl-6">
                  {childTickets.map(child => (
                    <button
                      key={child.id}
                      onClick={() => onSelectTicket?.(child.id)}
                      className="flex items-center gap-2 text-sm hover:bg-secondary/50 p-2 rounded w-full text-left transition-colors"
                    >
                      {child.level && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5"
                          style={{
                            color: LEVEL_COLORS[child.level],
                            borderColor: LEVEL_COLORS[child.level],
                          }}
                        >
                          {child.level}
                        </Badge>
                      )}
                      <span className="text-foreground truncate flex-1">{child.title}</span>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {child.status.replace('_', ' ')}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'proof' ? <ProofTab ticket={ticket} /> : activeTab === 'history' ? (
          <ApprovalHistoryTab ticket={ticket} />
        ) : activeTab === 'attachments' ? (
          <AttachmentUpload
            projectId={ticket.projectId}
            ticketId={ticket.id}
            attachments={attachments}
            onAttachmentAdded={handleAttachmentAdded}
            onAttachmentRemoved={handleAttachmentRemoved}
            disabled={!onUpdate}
          />
        ) : activeTab === 'design' ? (
          <FigmaLinks
            links={figmaLinks}
            onAdd={handleFigmaLinkAdded}
            onRemove={handleFigmaLinkRemoved}
            disabled={!onUpdate}
          />
        ) : activeTab === 'dependencies' ? (
          <TicketDependencies
            ticket={ticket}
            allTickets={allTickets}
            onAddDependency={onAddDependency}
            onRemoveDependency={onRemoveDependency}
            disabled={!onUpdate}
          />
        ) : (
        <>
        {/* AI Summary */}
        <CompactAISummary
          type="ticket"
          id={ticket.id}
          summary={aiSummary}
          onSummaryGenerated={handleAiSummaryGenerated}
        />

        {/* SLA Status */}
        <SLASummaryCard
          status={slaStatus}
          priority={ticket.sla?.priority || getDefaultPriorityFromComplexity(ticket.complexity)}
        />

        {/* Description - editable */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <FileText className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs font-medium text-muted">Description</span>
          </div>
          {isEditing ? (
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Add a description..."
              className="text-sm min-h-[80px]"
            />
          ) : (
            ticket.description ? (
              <p className="text-sm text-foreground">{ticket.description}</p>
            ) : (
              <p className="text-sm text-muted italic">No description</p>
            )
          )}
        </div>

        {/* Acceptance Criteria - editable */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs font-medium text-muted">
                Acceptance Criteria
              </span>
            </div>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-xs"
                onClick={handleAddCriterion}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-2">
              {editCriteria.map((criterion, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <Input
                    value={criterion}
                    onChange={(e) => handleUpdateCriterion(idx, e.target.value)}
                    placeholder="Enter criterion..."
                    className="flex-1 text-sm h-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-400"
                    onClick={() => handleRemoveCriterion(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {editCriteria.length === 0 && (
                <p className="text-sm text-muted italic">No acceptance criteria. Click &quot;Add&quot; to create one.</p>
              )}
            </div>
          ) : (
            ticket.acceptanceCriteria.length > 0 ? (
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
            ) : (
              <p className="text-sm text-muted italic">No acceptance criteria</p>
            )
          )}
        </div>

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

        {/* Approval Actions with Comment */}
        {isReview && !showApprovalComment && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 flex-1 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
              onClick={() => handleApprovalAction('approve')}
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 flex-1 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
              onClick={() => handleApprovalAction('reject')}
            >
              <Shield className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        )}
        
        {/* Approval Comment Dialog */}
        {showApprovalComment && (
          <div className="pt-2 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted" />
              <span className="text-sm font-medium">
                {approvalAction === 'approve' ? 'Approve' : 'Reject'} with comment
              </span>
            </div>
            <Textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder={`Add a comment explaining why you're ${approvalAction === 'approve' ? 'approving' : 'rejecting'} this ticket (optional)...`}
              className="text-sm min-h-[60px]"
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={approvalAction === 'approve' ? 'default' : 'destructive'}
                className="h-8 gap-1.5 flex-1 text-xs"
                onClick={handleSubmitApproval}
              >
                {approvalAction === 'approve' ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Confirm Approval
                  </>
                ) : (
                  <>
                    <Shield className="h-3.5 w-3.5" />
                    Confirm Rejection
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleCancelApproval}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  )
}

function ApprovalHistoryTab({ ticket }: { ticket: Ticket }) {
  const history = ticket.approvalHistory || []
  
  if (history.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="h-8 w-8 text-muted mx-auto mb-2" />
        <p className="text-sm text-muted">No approval history yet</p>
        <p className="text-xs text-muted mt-1">
          History will appear here when the ticket is approved or rejected
        </p>
      </div>
    )
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 mb-2">
        <History className="h-3.5 w-3.5 text-muted" />
        <span className="text-xs font-medium text-muted">Approval History</span>
      </div>
      {history.map((entry, idx) => (
        <div
          key={idx}
          className={`rounded-lg border p-3 ${
            entry.action === 'approved' 
              ? 'border-green-500/30 bg-green-500/5' 
              : 'border-red-500/30 bg-red-500/5'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {entry.action === 'approved' ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${
                entry.action === 'approved' ? 'text-green-500' : 'text-red-500'
              }`}>
                {entry.action === 'approved' ? 'Approved' : 'Rejected'}
              </span>
            </div>
            <span className="text-xs text-muted">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
          </div>
          {entry.user && (
            <div className="flex items-center gap-1.5 text-xs text-muted mb-1">
              <User className="h-3 w-3" />
              {entry.user}
            </div>
          )}
          {entry.comment && (
            <p className="text-sm text-foreground mt-2 pl-6">
              &quot;{entry.comment}&quot;
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
