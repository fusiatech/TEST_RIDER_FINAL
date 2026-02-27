'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Filter,
  X,
  User,
  Clock,
  FileText,
} from 'lucide-react'
import type { AuditLogEntry, AuditAction } from '@/lib/types'

const AUDIT_ACTIONS: AuditAction[] = [
  'user_login', 'user_logout',
  'project_create', 'project_update', 'project_delete',
  'ticket_create', 'ticket_update', 'ticket_delete', 'ticket_approve', 'ticket_reject',
  'job_start', 'job_cancel', 'job_complete', 'job_fail',
  'settings_update', 'api_key_rotate',
  'extension_install', 'extension_uninstall',
  'file_create', 'file_update', 'file_delete',
  'git_commit', 'git_push', 'git_pull',
]

const ACTION_COLORS: Record<string, string> = {
  user_login: 'bg-green-500/20 text-green-700 dark:text-green-400',
  user_logout: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
  project_create: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  project_update: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  project_delete: 'bg-red-500/20 text-red-700 dark:text-red-400',
  ticket_create: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  ticket_update: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  ticket_delete: 'bg-red-500/20 text-red-700 dark:text-red-400',
  ticket_approve: 'bg-green-500/20 text-green-700 dark:text-green-400',
  ticket_reject: 'bg-red-500/20 text-red-700 dark:text-red-400',
  job_start: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  job_cancel: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  job_complete: 'bg-green-500/20 text-green-700 dark:text-green-400',
  job_fail: 'bg-red-500/20 text-red-700 dark:text-red-400',
  settings_update: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  api_key_rotate: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  extension_install: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
  extension_uninstall: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  file_create: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  file_update: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  file_delete: 'bg-red-500/20 text-red-700 dark:text-red-400',
  git_commit: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  git_push: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  git_pull: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
}

interface AuditLogViewerProps {
  className?: string
}

export function AuditLogViewer({ className }: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [userIdFilter, setUserIdFilter] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  
  const limit = 25

  const fetchAuditLog = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      if (userIdFilter) params.set('userId', userIdFilter)
      if (actionFilter) params.set('action', actionFilter)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      params.set('limit', String(limit))
      params.set('offset', String(page * limit))
      
      const response = await fetch(`/api/admin/audit?${params.toString()}`)
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Failed to fetch audit log')
      }
      
      const data = await response.json()
      setEntries(data.entries)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [userIdFilter, actionFilter, startDate, endDate, page])

  useEffect(() => {
    fetchAuditLog()
  }, [fetchAuditLog])

  const clearFilters = () => {
    setUserIdFilter('')
    setActionFilter('')
    setStartDate('')
    setEndDate('')
    setPage(0)
  }

  const exportToCsv = () => {
    const headers = ['Timestamp', 'User ID', 'User Email', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address', 'User Agent']
    const rows = entries.map((entry) => [
      entry.timestamp,
      entry.userId,
      entry.userEmail,
      entry.action,
      entry.resourceType,
      entry.resourceId ?? '',
      entry.details ? JSON.stringify(entry.details) : '',
      entry.ipAddress ?? '',
      entry.userAgent ?? '',
    ])
    
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const totalPages = Math.ceil(total / limit)
  const hasFilters = userIdFilter || actionFilter || startDate || endDate

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Audit Log
            </CardTitle>
            <CardDescription>
              View all user actions and system events
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={hasFilters ? 'border-primary' : ''}
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {hasFilters && (
                <Badge variant="secondary" className="ml-1 h-5 px-1">
                  Active
                </Badge>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCsv} disabled={entries.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAuditLog} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {showFilters && (
          <div className="mb-4 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Filter Options</span>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="userId">User ID</Label>
                <Input
                  id="userId"
                  placeholder="Filter by user ID..."
                  value={userIdFilter}
                  onChange={(e) => {
                    setUserIdFilter(e.target.value)
                    setPage(0)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="action">Action</Label>
                <Select
                  value={actionFilter}
                  onValueChange={(value) => {
                    setActionFilter(value === 'all' ? '' : value)
                    setPage(0)
                  }}
                >
                  <SelectTrigger id="action">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {AUDIT_ACTIONS.map((action) => (
                      <SelectItem key={action} value={action}>
                        {formatAction(action)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setPage(0)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setPage(0)
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 border border-destructive/50 rounded-lg bg-destructive/10 text-destructive">
            {error}
          </div>
        )}

        <ScrollArea className="h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Time
                  </div>
                </TableHead>
                <TableHead className="w-[180px]">
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    User
                  </div>
                </TableHead>
                <TableHead className="w-[140px]">Action</TableHead>
                <TableHead className="w-[120px]">Resource</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading audit log...
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No audit entries found
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">
                      {formatDate(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-[150px]" title={entry.userEmail}>
                          {entry.userEmail}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={entry.userId}>
                          {entry.userId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={ACTION_COLORS[entry.action] ?? 'bg-gray-500/20'}>
                        {formatAction(entry.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{entry.resourceType}</span>
                        {entry.resourceId && (
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]" title={entry.resourceId}>
                            {entry.resourceId}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {entry.details && (
                        <code className="text-xs bg-muted px-2 py-1 rounded max-w-[300px] truncate block" title={JSON.stringify(entry.details)}>
                          {JSON.stringify(entry.details)}
                        </code>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {entries.length} of {total} entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {page + 1} of {Math.max(1, totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1 || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
