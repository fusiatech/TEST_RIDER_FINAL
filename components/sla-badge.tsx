'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { Clock, AlertTriangle, CheckCircle, Timer } from 'lucide-react'
import type { SLAStatus } from '@/lib/types'
import { formatTimeRemaining, getSLAUrgency } from '@/lib/sla-calculator'

interface SLABadgeProps {
  status: SLAStatus
  type: 'response' | 'resolution'
  completed?: boolean
}

export function SLABadge({ status, type, completed }: SLABadgeProps) {
  const deadline =
    type === 'response' ? status.responseDeadline : status.resolutionDeadline
  const breached =
    type === 'response' ? status.responseBreached : status.resolutionBreached
  const timeValue =
    type === 'response' ? status.timeToResponse : status.timeToResolution

  if (!deadline) return null

  if (completed && timeValue !== undefined) {
    const hours = Math.floor(timeValue / 60)
    const minutes = timeValue % 60
    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`

    return (
      <Tooltip content={`${type === 'response' ? 'Response' : 'Resolution'} time: ${timeStr}`}>
        <Badge
          variant={breached ? 'destructive' : 'secondary'}
          className="gap-1 text-[10px]"
        >
          <CheckCircle className="h-3 w-3" />
          {breached ? 'Late' : 'Met'} ({timeStr})
        </Badge>
      </Tooltip>
    )
  }

  if (breached) {
    return (
      <Tooltip content={`${type === 'response' ? 'Response' : 'Resolution'} SLA breached`}>
        <Badge variant="destructive" className="gap-1 text-[10px]">
          <AlertTriangle className="h-3 w-3" />
          Breached
        </Badge>
      </Tooltip>
    )
  }

  const urgency = getSLAUrgency(deadline)
  const timeRemaining = formatTimeRemaining(deadline)

  const getVariant = () => {
    switch (urgency) {
      case 'critical':
        return 'destructive'
      case 'warning':
        return 'outline'
      default:
        return 'secondary'
    }
  }

  const getClassName = () => {
    if (urgency === 'warning') {
      return 'gap-1 text-[10px] text-yellow-500 border-yellow-500/50'
    }
    return 'gap-1 text-[10px]'
  }

  return (
    <Tooltip
      content={`${type === 'response' ? 'Response' : 'Resolution'} due in ${timeRemaining}`}
    >
      <Badge variant={getVariant()} className={getClassName()}>
        {urgency === 'critical' ? (
          <Timer className="h-3 w-3" />
        ) : (
          <Clock className="h-3 w-3" />
        )}
        {timeRemaining}
      </Badge>
    </Tooltip>
  )
}

interface SLAIndicatorProps {
  status: SLAStatus
  showResponse?: boolean
  showResolution?: boolean
  responseCompleted?: boolean
  resolutionCompleted?: boolean
}

export function SLAIndicator({
  status,
  showResponse = true,
  showResolution = true,
  responseCompleted,
  resolutionCompleted,
}: SLAIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {showResponse && status.responseDeadline && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted">Response:</span>
          <SLABadge status={status} type="response" completed={responseCompleted} />
        </div>
      )}
      {showResolution && status.resolutionDeadline && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted">Resolution:</span>
          <SLABadge status={status} type="resolution" completed={resolutionCompleted} />
        </div>
      )}
    </div>
  )
}

interface SLASummaryCardProps {
  status: SLAStatus
  priority: string
}

export function SLASummaryCard({ status, priority }: SLASummaryCardProps) {
  const responseUrgency = status.responseDeadline
    ? getSLAUrgency(status.responseDeadline)
    : 'normal'
  const resolutionUrgency = status.resolutionDeadline
    ? getSLAUrgency(status.resolutionDeadline)
    : 'normal'

  const overallUrgency =
    responseUrgency === 'critical' || resolutionUrgency === 'critical'
      ? 'critical'
      : responseUrgency === 'warning' || resolutionUrgency === 'warning'
        ? 'warning'
        : 'normal'

  const getBorderColor = () => {
    switch (overallUrgency) {
      case 'critical':
        return 'border-red-500/50'
      case 'warning':
        return 'border-yellow-500/50'
      default:
        return 'border-border'
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${getBorderColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted">SLA Status</span>
        <Badge variant="outline" className="text-[10px]">
          {priority}
        </Badge>
      </div>
      <div className="space-y-2">
        {status.responseDeadline && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Response</span>
            <SLABadge
              status={status}
              type="response"
              completed={status.timeToResponse !== undefined}
            />
          </div>
        )}
        {status.resolutionDeadline && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Resolution</span>
            <SLABadge
              status={status}
              type="resolution"
              completed={status.timeToResolution !== undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
