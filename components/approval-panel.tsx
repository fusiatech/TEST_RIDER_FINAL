'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  Check,
  X,
  Clock,
  AlertTriangle,
  ChevronRight,
  MessageSquare,
  User,
  History,
  FileText,
  Ticket,
  Package,
  Rocket,
  RefreshCw,
} from 'lucide-react'
import type {
  ApprovalRequest,
  ApprovalChain,
  ApprovalEntry,
  ApprovalRequestStatus,
  ResourceType,
} from '@/lib/approval-types'

interface ApprovalPanelProps {
  userId: string
  userRole?: 'admin' | 'editor' | 'viewer'
  onApprovalComplete?: (request: ApprovalRequest) => void
}

const STATUS_COLORS: Record<ApprovalRequestStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
  approved: 'bg-green-500/20 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/20 text-red-600 dark:text-red-400',
  escalated: 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
  cancelled: 'bg-gray-500/20 text-gray-600 dark:text-gray-400',
}

const RESOURCE_ICONS: Record<ResourceType, typeof FileText> = {
  ticket: Ticket,
  prd: FileText,
  release: Rocket,
  project: Package,
  epic: Package,
  deployment: Rocket,
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function formatDeadline(deadline: number): { text: string; isUrgent: boolean; isOverdue: boolean } {
  const now = Date.now()
  const diff = deadline - now
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (diff < 0) {
    const overdueHours = Math.abs(hours)
    return {
      text: `${overdueHours}h overdue`,
      isUrgent: true,
      isOverdue: true,
    }
  }

  if (hours < 4) {
    return { text: `${hours}h left`, isUrgent: true, isOverdue: false }
  }

  if (hours < 24) {
    return { text: `${hours}h left`, isUrgent: false, isOverdue: false }
  }

  return { text: `${days}d left`, isUrgent: false, isOverdue: false }
}

interface ApprovalRequestCardProps {
  request: ApprovalRequest
  chain?: ApprovalChain
  userId: string
  userRole?: 'admin' | 'editor' | 'viewer'
  onApprove: (requestId: string, comment: string) => Promise<void>
  onReject: (requestId: string, comment: string) => Promise<void>
  isExpanded: boolean
  onToggleExpand: () => void
}

function ApprovalRequestCard({
  request,
  chain,
  userId,
  userRole,
  onApprove,
  onReject,
  isExpanded,
  onToggleExpand,
}: ApprovalRequestCardProps) {
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const currentLevel = chain?.levels.find((l) => l.order === request.currentLevel)
  const ResourceIcon = RESOURCE_ICONS[request.resourceType] || FileText

  const canApprove =
    (request.status === 'pending' || request.status === 'escalated') &&
    currentLevel &&
    (currentLevel.approverUserIds.includes(userId) ||
      (userRole && currentLevel.approverRoles.includes(userRole)))

  const hasAlreadyActed = request.approvals.some(
    (a) => a.userId === userId && a.levelOrder === request.currentLevel
  )

  const deadline = request.deadline ? formatDeadline(request.deadline) : null

  const handleApprove = async () => {
    setIsSubmitting(true)
    try {
      await onApprove(request.id, comment)
      setComment('')
      toast.success('Approval submitted')
    } catch (error) {
      toast.error('Failed to approve')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    setIsSubmitting(true)
    try {
      await onReject(request.id, comment)
      setComment('')
      toast.success('Rejection submitted')
    } catch (error) {
      toast.error('Failed to reject')
    } finally {
      setIsSubmitting(false)
    }
  }

  const levelApprovals = request.approvals.filter(
    (a) => a.levelOrder === request.currentLevel && a.decision === 'approved'
  )
  const requiredApprovals = currentLevel?.requiredApprovals || 1
  const progressPercent = Math.min(100, (levelApprovals.length / requiredApprovals) * 100)

  return (
    <Card className="border-border">
      <CardHeader
        className="cursor-pointer py-3 px-4"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-secondary">
              <ResourceIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {request.resourceName || `${request.resourceType} #${request.resourceId.slice(0, 8)}`}
                </span>
                <Badge className={STATUS_COLORS[request.status]} variant="secondary">
                  {request.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>{chain?.name || 'Unknown Chain'}</span>
                <span>•</span>
                <span>Level {request.currentLevel}: {currentLevel?.name || 'Unknown'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {deadline && (
              <div
                className={`flex items-center gap-1 text-xs ${
                  deadline.isOverdue
                    ? 'text-red-500'
                    : deadline.isUrgent
                    ? 'text-orange-500'
                    : 'text-muted-foreground'
                }`}
              >
                {deadline.isOverdue ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                {deadline.text}
              </div>
            )}
            <ChevronRight
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 pb-4 px-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Approvals: {levelApprovals.length}/{requiredApprovals}
              </span>
              <span className="text-muted-foreground">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span>Requested by: {request.requestedByEmail || request.requestedBy}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatRelativeTime(request.createdAt)}</span>
            </div>
          </div>

          {canApprove && !hasAlreadyActed && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Comment (optional)
                </label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="min-h-[60px] text-sm"
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="flex-1 gap-1.5"
                  size="sm"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={isSubmitting}
                  variant="destructive"
                  className="flex-1 gap-1.5"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          )}

          {hasAlreadyActed && (
            <div className="py-2 px-3 rounded-md bg-secondary/50 text-sm text-muted-foreground">
              You have already submitted your decision for this level.
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              {showHistory ? 'Hide' : 'Show'} approval history ({request.approvals.length})
            </button>

            {showHistory && request.approvals.length > 0 && (
              <div className="mt-3 space-y-2">
                {request.approvals.map((approval, idx) => (
                  <ApprovalHistoryEntry key={idx} approval={approval} />
                ))}
              </div>
            )}

            {showHistory && request.escalationHistory && request.escalationHistory.length > 0 && (
              <div className="mt-3 space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Escalations</span>
                {request.escalationHistory.map((escalation, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 py-2 px-3 rounded-md bg-orange-500/10"
                  >
                    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                    <div className="flex-1 text-xs">
                      <div className="text-foreground">
                        Escalated from Level {escalation.fromLevel} to Level {escalation.toLevel}
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {escalation.reason} • {formatRelativeTime(escalation.timestamp)}
                      </div>
                    </div>
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

function ApprovalHistoryEntry({ approval }: { approval: ApprovalEntry }) {
  const isApproved = approval.decision === 'approved'

  return (
    <div
      className={`flex items-start gap-2 py-2 px-3 rounded-md ${
        isApproved ? 'bg-green-500/10' : 'bg-red-500/10'
      }`}
    >
      {isApproved ? (
        <Check className="h-4 w-4 text-green-500 mt-0.5" />
      ) : (
        <X className="h-4 w-4 text-red-500 mt-0.5" />
      )}
      <div className="flex-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-foreground">
            {approval.userEmail || approval.userId} {isApproved ? 'approved' : 'rejected'}
          </span>
          <span className="text-muted-foreground">Level {approval.levelOrder}</span>
        </div>
        {approval.comment && (
          <div className="text-muted-foreground mt-1 italic">&quot;{approval.comment}&quot;</div>
        )}
        <div className="text-muted-foreground mt-0.5">
          {formatRelativeTime(approval.timestamp)}
        </div>
      </div>
    </div>
  )
}

export function ApprovalPanel({ userId, userRole, onApprovalComplete }: ApprovalPanelProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [chains, setChains] = useState<Map<string, ApprovalChain>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')

  const fetchApprovals = useCallback(async () => {
    try {
      const response = await fetch(`/api/approvals?userId=${userId}&filter=${filter}`)
      if (!response.ok) throw new Error('Failed to fetch approvals')

      const data = await response.json()
      setRequests(data.requests || [])

      const chainMap = new Map<string, ApprovalChain>()
      for (const chain of data.chains || []) {
        chainMap.set(chain.id, chain)
      }
      setChains(chainMap)
    } catch (error) {
      toast.error('Failed to load approvals')
    } finally {
      setIsLoading(false)
    }
  }, [userId, filter])

  useEffect(() => {
    fetchApprovals()
  }, [fetchApprovals])

  const handleApprove = async (requestId: string, comment: string) => {
    const response = await fetch('/api/approvals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        action: 'approve',
        userId,
        comment,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to approve')
    }

    const updated = await response.json()
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? updated.request : r))
    )

    if (updated.request.status === 'approved' && onApprovalComplete) {
      onApprovalComplete(updated.request)
    }
  }

  const handleReject = async (requestId: string, comment: string) => {
    const response = await fetch('/api/approvals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        action: 'reject',
        userId,
        comment,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to reject')
    }

    const updated = await response.json()
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? updated.request : r))
    )

    if (onApprovalComplete) {
      onApprovalComplete(updated.request)
    }
  }

  const pendingCount = requests.filter(
    (r) => r.status === 'pending' || r.status === 'escalated'
  ).length

  const filteredRequests =
    filter === 'pending'
      ? requests.filter((r) => r.status === 'pending' || r.status === 'escalated')
      : requests

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Approvals</CardTitle>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="bg-primary/20 text-primary">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1 text-xs transition-colors ${
                  filter === 'pending'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-xs transition-colors ${
                  filter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setIsLoading(true)
                fetchApprovals()
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {filter === 'pending' ? (
              <>
                <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
                No pending approvals
              </>
            ) : (
              'No approval requests found'
            )}
          </div>
        ) : (
          filteredRequests.map((request) => (
            <ApprovalRequestCard
              key={request.id}
              request={request}
              chain={chains.get(request.chainId)}
              userId={userId}
              userRole={userRole}
              onApprove={handleApprove}
              onReject={handleReject}
              isExpanded={expandedId === request.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === request.id ? null : request.id)
              }
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function ApprovalStatusBadge({ status }: { status: ApprovalRequestStatus }) {
  return (
    <Badge className={STATUS_COLORS[status]} variant="secondary">
      {status}
    </Badge>
  )
}

export function ApprovalProgressBar({
  current,
  total,
  className,
}: {
  current: number
  total: number
  className?: string
}) {
  const percent = Math.min(100, (current / total) * 100)

  return (
    <div className={`space-y-1 ${className || ''}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {current}/{total} approvals
        </span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
