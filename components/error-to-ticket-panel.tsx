'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertTriangle,
  Bug,
  Link,
  Unlink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Hash,
  FileCode,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ErrorFingerprint {
  hash: string
  message: string
  stackTrace: string
  component: string
  source: 'error-boundary' | 'logger' | 'test-failure' | 'ci-cd' | 'api' | 'unknown'
  firstSeen: number
  lastSeen: number
  occurrenceCount: number
  ticketId?: string
  metadata?: Record<string, unknown>
}

interface ErrorStatistics {
  totalFingerprints: number
  totalOccurrences: number
  fingerprintsWithTickets: number
  fingerprintsWithoutTickets: number
  readyForTicket: number
  bySource: Record<string, number>
  byComponent: Record<string, number>
  recentErrors: number
}

interface ErrorTrend {
  hash: string
  message: string
  component: string
  hourlyOccurrences: number[]
  trend: 'increasing' | 'decreasing' | 'stable'
  percentChange: number
}

interface ErrorToTicketPanelProps {
  projectId?: string
  onTicketCreated?: (ticketId: string) => void
  className?: string
}

const SOURCE_COLORS: Record<string, string> = {
  'error-boundary': 'bg-red-500/20 text-red-400',
  'logger': 'bg-yellow-500/20 text-yellow-400',
  'test-failure': 'bg-purple-500/20 text-purple-400',
  'ci-cd': 'bg-blue-500/20 text-blue-400',
  'api': 'bg-green-500/20 text-green-400',
  'unknown': 'bg-gray-500/20 text-gray-400',
}

const SOURCE_LABELS: Record<string, string> = {
  'error-boundary': 'UI Error',
  'logger': 'Logger',
  'test-failure': 'Test',
  'ci-cd': 'CI/CD',
  'api': 'API',
  'unknown': 'Unknown',
}

export function ErrorToTicketPanel({ projectId, onTicketCreated, className }: ErrorToTicketPanelProps) {
  const [fingerprints, setFingerprints] = useState<ErrorFingerprint[]>([])
  const [statistics, setStatistics] = useState<ErrorStatistics | null>(null)
  const [trends, setTrends] = useState<ErrorTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const [linkingHash, setLinkingHash] = useState<string | null>(null)
  const [ticketIdInput, setTicketIdInput] = useState('')
  const [creatingTicket, setCreatingTicket] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [fpRes, statsRes, trendsRes] = await Promise.all([
        fetch('/api/errors'),
        fetch('/api/errors?action=statistics'),
        fetch('/api/errors?action=trends&hours=24'),
      ])

      if (fpRes.ok) {
        const data = await fpRes.json()
        setFingerprints(data.fingerprints || [])
      }

      if (statsRes.ok) {
        setStatistics(await statsRes.json())
      }

      if (trendsRes.ok) {
        setTrends(await trendsRes.json())
      }
    } catch (error) {
      console.error('Failed to fetch error data:', error)
      toast.error('Failed to load error data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleCreateTicket = async (hash: string) => {
    if (!projectId) {
      toast.error('No project selected')
      return
    }

    setCreatingTicket(hash)
    try {
      const res = await fetch('/api/errors?action=create-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintHash: hash, projectId }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create ticket')
      }

      const { ticket, fingerprint } = await res.json()
      toast.success(`Created ticket: ${ticket.title}`)
      
      setFingerprints((prev) =>
        prev.map((fp) => (fp.hash === hash ? fingerprint : fp))
      )
      
      onTicketCreated?.(ticket.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create ticket')
    } finally {
      setCreatingTicket(null)
    }
  }

  const handleLinkTicket = async (hash: string) => {
    if (!ticketIdInput.trim()) {
      toast.error('Enter a ticket ID')
      return
    }

    try {
      const res = await fetch('/api/errors?action=link', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintHash: hash, ticketId: ticketIdInput.trim() }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to link ticket')
      }

      const fingerprint = await res.json()
      toast.success('Linked error to ticket')
      
      setFingerprints((prev) =>
        prev.map((fp) => (fp.hash === hash ? fingerprint : fp))
      )
      setLinkingHash(null)
      setTicketIdInput('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link ticket')
    }
  }

  const handleUnlinkTicket = async (hash: string) => {
    try {
      const res = await fetch('/api/errors?action=unlink', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintHash: hash }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to unlink ticket')
      }

      const fingerprint = await res.json()
      toast.success('Unlinked error from ticket')
      
      setFingerprints((prev) =>
        prev.map((fp) => (fp.hash === hash ? fingerprint : fp))
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unlink ticket')
    }
  }

  const getTrendForHash = (hash: string): ErrorTrend | undefined => {
    return trends.find((t) => t.hash === hash)
  }

  const renderTrendIcon = (trend: ErrorTrend['trend']) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="h-4 w-4 text-red-400" />
      case 'decreasing':
        return <TrendingDown className="h-4 w-4 text-green-400" />
      default:
        return <Minus className="h-4 w-4 text-gray-400" />
    }
  }

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-red-400" />
          <h2 className="text-lg font-semibold">Error Tracking</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true)
              fetchData()
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total Errors"
            value={statistics.totalFingerprints}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <StatCard
            label="Occurrences"
            value={statistics.totalOccurrences}
            icon={<Hash className="h-4 w-4" />}
          />
          <StatCard
            label="With Tickets"
            value={statistics.fingerprintsWithTickets}
            icon={<Link className="h-4 w-4" />}
            variant="success"
          />
          <StatCard
            label="Ready for Ticket"
            value={statistics.readyForTicket}
            icon={<Plus className="h-4 w-4" />}
            variant="warning"
          />
        </div>
      )}

      {/* Source breakdown */}
      {statistics && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(statistics.bySource).map(([source, count]) => (
            count > 0 && (
              <span
                key={source}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium',
                  SOURCE_COLORS[source]
                )}
              >
                {SOURCE_LABELS[source]}: {count}
              </span>
            )
          ))}
        </div>
      )}

      {/* Error list */}
      <div className="flex flex-col gap-2">
        {fingerprints.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bug className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No errors recorded yet</p>
          </div>
        ) : (
          fingerprints
            .sort((a, b) => b.lastSeen - a.lastSeen)
            .map((fp) => {
              const trend = getTrendForHash(fp.hash)
              const isExpanded = expandedHash === fp.hash
              const isLinking = linkingHash === fp.hash

              return (
                <div
                  key={fp.hash}
                  className="border rounded-lg bg-card overflow-hidden"
                >
                  {/* Error header */}
                  <div
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50"
                    onClick={() => setExpandedHash(isExpanded ? null : fp.hash)}
                  >
                    <button className="mt-1">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-xs font-medium',
                            SOURCE_COLORS[fp.source]
                          )}
                        >
                          {SOURCE_LABELS[fp.source]}
                        </span>
                        {fp.ticketId && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">
                            Linked
                          </span>
                        )}
                        {trend && (
                          <span className="flex items-center gap-1 text-xs">
                            {renderTrendIcon(trend.trend)}
                            {trend.percentChange !== 0 && (
                              <span className={cn(
                                trend.trend === 'increasing' ? 'text-red-400' : 'text-green-400'
                              )}>
                                {trend.percentChange > 0 ? '+' : ''}{trend.percentChange.toFixed(0)}%
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-medium truncate">{fp.message}</p>

                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileCode className="h-3 w-3" />
                          {fp.component}
                        </span>
                        <span className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {fp.occurrenceCount}x
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(fp.lastSeen)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t p-3 bg-muted/30">
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">Stack Trace</p>
                        <pre className="text-xs bg-black/20 p-2 rounded overflow-x-auto max-h-40">
                          {fp.stackTrace || 'No stack trace available'}
                        </pre>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                        <span>First seen: {new Date(fp.firstSeen).toLocaleString()}</span>
                        <span>|</span>
                        <span>Hash: {fp.hash.slice(0, 12)}...</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {!fp.ticketId ? (
                          <>
                            <Button
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCreateTicket(fp.hash)
                              }}
                              disabled={creatingTicket === fp.hash || !projectId}
                            >
                              {creatingTicket === fp.hash ? (
                                <Spinner className="h-4 w-4 mr-1" />
                              ) : (
                                <Plus className="h-4 w-4 mr-1" />
                              )}
                              Create Ticket
                            </Button>

                            {isLinking ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Ticket ID"
                                  value={ticketIdInput}
                                  onChange={(e) => setTicketIdInput(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2 py-1 text-sm rounded border bg-background w-32"
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleLinkTicket(fp.hash)
                                  }}
                                >
                                  Link
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setLinkingHash(null)
                                    setTicketIdInput('')
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setLinkingHash(fp.hash)
                                }}
                              >
                                <Link className="h-4 w-4 mr-1" />
                                Link Existing
                              </Button>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              Linked to: <code className="bg-muted px-1 rounded">{fp.ticketId}</code>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleUnlinkTicket(fp.hash)
                              }}
                            >
                              <Unlink className="h-4 w-4 mr-1" />
                              Unlink
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}

function StatCard({ label, value, icon, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'bg-card',
    success: 'bg-green-500/10',
    warning: 'bg-yellow-500/10',
    error: 'bg-red-500/10',
  }

  return (
    <div className={cn('rounded-lg p-3 border', variantStyles[variant])}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
