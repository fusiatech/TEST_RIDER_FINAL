'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Info, ChevronRight, ChevronDown, FileText } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface Problem {
  file: string
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
  source?: string
}

interface ProblemsPanelProps {
  problems: Problem[]
  onProblemClick?: (problem: Problem) => void
  className?: string
}

interface GroupedProblems {
  file: string
  problems: Problem[]
  errorCount: number
  warningCount: number
  infoCount: number
}

function getSeverityIcon(severity: Problem['severity']) {
  switch (severity) {
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
    case 'warning':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
    case 'info':
      return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
  }
}

function getSeverityColor(severity: Problem['severity']) {
  switch (severity) {
    case 'error':
      return 'text-destructive'
    case 'warning':
      return 'text-amber-500'
    case 'info':
      return 'text-blue-500'
  }
}

export function ProblemsPanel({ problems, onProblemClick, className }: ProblemsPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  const groupedProblems = useMemo((): GroupedProblems[] => {
    const groups = new Map<string, Problem[]>()
    
    for (const problem of problems) {
      const existing = groups.get(problem.file) || []
      existing.push(problem)
      groups.set(problem.file, existing)
    }

    return Array.from(groups.entries()).map(([file, fileProblems]) => ({
      file,
      problems: fileProblems.sort((a, b) => a.line - b.line),
      errorCount: fileProblems.filter(p => p.severity === 'error').length,
      warningCount: fileProblems.filter(p => p.severity === 'warning').length,
      infoCount: fileProblems.filter(p => p.severity === 'info').length,
    })).sort((a, b) => {
      if (a.errorCount !== b.errorCount) return b.errorCount - a.errorCount
      if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount
      return a.file.localeCompare(b.file)
    })
  }, [problems])

  const totalCounts = useMemo(() => ({
    errors: problems.filter(p => p.severity === 'error').length,
    warnings: problems.filter(p => p.severity === 'warning').length,
    info: problems.filter(p => p.severity === 'info').length,
  }), [problems])

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }
      return next
    })
  }

  const getFileName = (filePath: string) => {
    return filePath.split(/[/\\]/).pop() || filePath
  }

  if (problems.length === 0) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-muted">Problems</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">0</Badge>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-sm text-muted">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No problems detected</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className="text-xs font-medium text-muted">Problems</span>
        <div className="flex items-center gap-1.5">
          {totalCounts.errors > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
              {totalCounts.errors}
            </Badge>
          )}
          {totalCounts.warnings > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/20 text-amber-600 border-amber-500/30">
              {totalCounts.warnings}
            </Badge>
          )}
          {totalCounts.info > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/20 text-blue-600 border-blue-500/30">
              {totalCounts.info}
            </Badge>
          )}
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="py-1">
          {groupedProblems.map((group) => {
            const isExpanded = expandedFiles.has(group.file)
            
            return (
              <div key={group.file}>
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                  onClick={() => toggleFile(group.file)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
                  )}
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="text-xs font-mono truncate flex-1" title={group.file}>
                    {getFileName(group.file)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {group.errorCount > 0 && (
                      <span className="text-[10px] text-destructive font-medium">
                        {group.errorCount}
                      </span>
                    )}
                    {group.warningCount > 0 && (
                      <span className="text-[10px] text-amber-500 font-medium">
                        {group.warningCount}
                      </span>
                    )}
                    {group.infoCount > 0 && (
                      <span className="text-[10px] text-blue-500 font-medium">
                        {group.infoCount}
                      </span>
                    )}
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="pl-4">
                    {group.problems.map((problem, idx) => (
                      <button
                        key={`${problem.file}-${problem.line}-${problem.column}-${idx}`}
                        className="flex items-start gap-2 w-full px-2 py-1.5 text-left hover:bg-secondary/50 transition-colors"
                        onClick={() => onProblemClick?.(problem)}
                      >
                        {getSeverityIcon(problem.severity)}
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-xs leading-tight', getSeverityColor(problem.severity))}>
                            {problem.message}
                          </p>
                          <p className="text-[10px] text-muted mt-0.5">
                            Ln {problem.line}, Col {problem.column}
                            {problem.source && (
                              <span className="ml-2 opacity-70">({problem.source})</span>
                            )}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

export function ProblemsBadge({ problems }: { problems: Problem[] }) {
  const errorCount = problems.filter(p => p.severity === 'error').length
  const warningCount = problems.filter(p => p.severity === 'warning').length
  
  if (errorCount === 0 && warningCount === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1">
      {errorCount > 0 && (
        <div className="flex items-center gap-0.5">
          <AlertCircle className="h-3 w-3 text-destructive" />
          <span className="text-[10px] text-destructive font-medium">{errorCount}</span>
        </div>
      )}
      {warningCount > 0 && (
        <div className="flex items-center gap-0.5">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] text-amber-500 font-medium">{warningCount}</span>
        </div>
      )}
    </div>
  )
}
