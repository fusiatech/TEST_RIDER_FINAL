'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { History, RotateCcw, GitCompare, ChevronDown, ChevronRight, Clock, User } from 'lucide-react'
import type { PRDVersion } from '@/lib/types'
import { cn } from '@/lib/utils'

interface PRDVersionHistoryProps {
  projectId: string
  onVersionSelect?: (version: PRDVersion) => void
  onRollback?: (version: number) => void
  className?: string
}

interface VersionDiff {
  added: string[]
  removed: string[]
  modified: Array<{
    sectionTitle: string
    oldContent: string
    newContent: string
  }>
}

export function PRDVersionHistory({
  projectId,
  onVersionSelect,
  onRollback,
  className,
}: PRDVersionHistoryProps) {
  const [versions, setVersions] = useState<PRDVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [compareFrom, setCompareFrom] = useState<number | null>(null)
  const [compareTo, setCompareTo] = useState<number | null>(null)
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set())

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/projects/${projectId}/prd/versions`)
      if (!res.ok) throw new Error('Failed to fetch versions')
      const data = await res.json()
      setVersions(data.versions || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleCompare = async () => {
    if (compareFrom === null || compareTo === null) return
    
    try {
      const res = await fetch(
        `/api/projects/${projectId}/prd/versions/compare?v1=${compareFrom}&v2=${compareTo}`
      )
      if (!res.ok) throw new Error('Failed to compare versions')
      const data = await res.json()
      setDiff(data.diff)
      setShowDiff(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare versions')
    }
  }

  const handleRollback = async (version: number) => {
    if (!confirm(`Are you sure you want to rollback to version ${version}?`)) return
    
    try {
      const res = await fetch(`/api/projects/${projectId}/prd/versions/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      })
      if (!res.ok) throw new Error('Failed to rollback')
      await fetchVersions()
      onRollback?.(version)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rollback')
    }
  }

  const toggleVersionExpanded = (version: number) => {
    setExpandedVersions(prev => {
      const next = new Set(prev)
      if (next.has(version)) {
        next.delete(version)
      } else {
        next.add(version)
      }
      return next
    })
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  if (loading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('p-4 text-destructive', className)}>
        {error}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <History className="h-5 w-5" />
          Version History
        </h3>
        <span className="text-sm text-muted-foreground">
          {versions.length} version{versions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {versions.length > 1 && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          <select
            className="bg-background border rounded px-2 py-1 text-sm"
            value={compareFrom ?? ''}
            onChange={(e) => setCompareFrom(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">From version...</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">to</span>
          <select
            className="bg-background border rounded px-2 py-1 text-sm"
            value={compareTo ?? ''}
            onChange={(e) => setCompareTo(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">To version...</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCompare}
            disabled={compareFrom === null || compareTo === null || compareFrom === compareTo}
          >
            Compare
          </Button>
        </div>
      )}

      {showDiff && diff && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">
              Comparing v{compareFrom} → v{compareTo}
            </h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDiff(false)}
            >
              Close
            </Button>
          </div>
          
          {diff.added.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                Added Sections ({diff.added.length})
              </h5>
              <ul className="text-sm space-y-1">
                {diff.added.map((title) => (
                  <li key={title} className="text-green-600 dark:text-green-400">
                    + {title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {diff.removed.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                Removed Sections ({diff.removed.length})
              </h5>
              <ul className="text-sm space-y-1">
                {diff.removed.map((title) => (
                  <li key={title} className="text-red-600 dark:text-red-400">
                    - {title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {diff.modified.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                Modified Sections ({diff.modified.length})
              </h5>
              <div className="space-y-3">
                {diff.modified.map((mod) => (
                  <div key={mod.sectionTitle} className="border rounded p-3 bg-background">
                    <h6 className="font-medium text-sm mb-2">{mod.sectionTitle}</h6>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded">
                        <div className="text-red-600 dark:text-red-400 font-medium mb-1">Old</div>
                        <pre className="whitespace-pre-wrap text-muted-foreground line-clamp-4">
                          {mod.oldContent}
                        </pre>
                      </div>
                      <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded">
                        <div className="text-green-600 dark:text-green-400 font-medium mb-1">New</div>
                        <pre className="whitespace-pre-wrap text-muted-foreground line-clamp-4">
                          {mod.newContent}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && (
            <p className="text-sm text-muted-foreground">No differences found between versions.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No version history available. Save your PRD to create the first version.
          </p>
        ) : (
          versions
            .slice()
            .sort((a, b) => b.version - a.version)
            .map((version) => {
              const isExpanded = expandedVersions.has(version.version)
              const isLatest = version.version === Math.max(...versions.map(v => v.version))
              
              return (
                <div
                  key={version.version}
                  className={cn(
                    'border rounded-lg overflow-hidden transition-colors',
                    selectedVersion === version.version && 'ring-2 ring-primary',
                    isLatest && 'border-primary/50'
                  )}
                >
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleVersionExpanded(version.version)}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Version {version.version}</span>
                          {isLatest && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(version.createdAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {version.author}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isLatest && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRollback(version.version)
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Rollback
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedVersion(version.version)
                          onVersionSelect?.(version)
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="border-t p-3 bg-muted/30">
                      <div className="mb-3">
                        <h5 className="text-sm font-medium mb-1">Change Log</h5>
                        <p className="text-sm text-muted-foreground">{version.changeLog}</p>
                      </div>
                      
                      <div>
                        <h5 className="text-sm font-medium mb-2">
                          Sections ({version.sections.length})
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {version.sections.map((section) => (
                            <span
                              key={section.id}
                              className="text-xs bg-background border rounded px-2 py-1"
                            >
                              {section.title}
                              {section.linkedTicketIds.length > 0 && (
                                <span className="ml-1 text-primary">
                                  ({section.linkedTicketIds.length} tickets)
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
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
