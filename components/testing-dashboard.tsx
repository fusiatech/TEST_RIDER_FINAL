'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import {
  TestTube2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Play,
  RefreshCw,
  Filter,
  FileCode2,
  Clock,
  TrendingUp,
  Loader2,
  Square,
  FolderTree,
  BarChart3,
  Lightbulb,
  Zap,
  Shield,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Percent,
  GitBranch,
  Code2,
  FileText,
  Search,
  GitCompare,
  ArrowRightLeft,
  Download,
  FileJson,
  FileSpreadsheet,
  Globe,
} from 'lucide-react'
import { useSwarmStore } from '@/lib/store'
import { wsClient } from '@/lib/ws-client'
import type { TestRunSummary, TestResult, TestJob, CoverageData, FileCoverage } from '@/lib/types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type StatusFilter = 'all' | 'passed' | 'failed' | 'skipped'
type DashboardTab = 'results' | 'coverage' | 'trends' | 'compare'
type SortField = 'path' | 'lines' | 'branches' | 'functions' | 'statements'
type SortDirection = 'asc' | 'desc'

interface ComparisonResult {
  newFailures: TestResult[]
  fixedTests: TestResult[]
  unchangedFailures: TestResult[]
  unchangedPasses: TestResult[]
}

interface FlakyTestInfo {
  name: string
  file?: string
  passCount: number
  failCount: number
  flakyScore: number
}

interface TestFile {
  path: string
  testCount: number
  passedCount: number
  failedCount: number
  skippedCount: number
}

interface ErrorPattern {
  pattern: RegExp
  summary: string
  action: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/i,
    summary: 'Missing module import',
    action: 'Install the missing package with npm install or check the import path',
  },
  {
    pattern: /TypeError: (.*) is not a function/i,
    summary: 'Type error - calling non-function',
    action: 'Check that the variable is properly initialized and is a function',
  },
  {
    pattern: /ReferenceError: (.*) is not defined/i,
    summary: 'Undefined variable reference',
    action: 'Ensure the variable is declared and in scope',
  },
  {
    pattern: /Expected (.*) to (equal|be|match|contain) (.*)/i,
    summary: 'Assertion failed',
    action: 'Review the expected vs actual values and update test or implementation',
  },
  {
    pattern: /timeout of \d+ms exceeded/i,
    summary: 'Test timeout',
    action: 'Increase timeout or optimize the async operation',
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
    summary: 'Network connection error',
    action: 'Check that the service is running and accessible',
  },
  {
    pattern: /SyntaxError/i,
    summary: 'Syntax error in code',
    action: 'Fix the syntax error in the indicated file and line',
  },
  {
    pattern: /AssertionError/i,
    summary: 'Test assertion failed',
    action: 'Review the assertion and fix the implementation or expected value',
  },
  {
    pattern: /null|undefined/i,
    summary: 'Null/undefined value encountered',
    action: 'Add null checks or ensure the value is properly initialized',
  },
]

function getErrorSummary(error: string | undefined): { summary: string; action: string } {
  if (!error) {
    return { summary: 'Unknown error', action: 'Review the stack trace for more details' }
  }

  for (const { pattern, summary, action } of ERROR_PATTERNS) {
    if (pattern.test(error)) {
      return { summary, action }
    }
  }

  const firstLine = error.split('\n')[0].trim()
  return {
    summary: firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine,
    action: 'Review the error message and stack trace',
  }
}

const RESULTS_PER_PAGE = 15

function getCoverageColor(pct: number): string {
  if (pct >= 80) return 'text-green-500'
  if (pct >= 50) return 'text-yellow-500'
  return 'text-red-500'
}

function getCoverageBarColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getCoverageBadgeVariant(pct: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (pct >= 80) return 'default'
  if (pct >= 50) return 'secondary'
  return 'destructive'
}

function InlineError({ 
  error, 
  onRetry 
}: { 
  error: string
  onRetry: () => void 
}) {
  return (
    <div className="flex items-center gap-2 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
      <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
      <span className="text-sm text-foreground flex-1">{error}</span>
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw className="h-4 w-4 mr-1" />
        Retry
      </Button>
    </div>
  )
}

export function TestingDashboard() {
  const { settings, initWebSocket } = useSwarmStore()
  
  const [history, setHistory] = useState<TestRunSummary[]>([])
  const [currentJob, setCurrentJob] = useState<TestJob | null>(null)
  const [liveOutput, setLiveOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [framework, setFramework] = useState<string>('unknown')
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTab, setActiveTab] = useState<DashboardTab>('results')
  const [coverageSortField, setCoverageSortField] = useState<SortField>('lines')
  const [coverageSortDirection, setCoverageSortDirection] = useState<SortDirection>('desc')
  const [coverageSearchFilter, setCoverageSearchFilter] = useState('')
  
  // Task 5: Test Comparison state
  const [compareRun1, setCompareRun1] = useState<string | null>(null)
  const [compareRun2, setCompareRun2] = useState<string | null>(null)
  
  // Task 6: Enhanced search/filter for test output
  const [outputSearchQuery, setOutputSearchQuery] = useState('')

  // Task 4.1.2: File path filtering
  const [fileFilter, setFileFilter] = useState<string | null>(null)

  // Error state handling
  const [loadError, setLoadError] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  
  const outputRef = useRef<HTMLPreElement>(null)
  const wsInitialized = useRef(false)

  const loadTestData = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch('/api/tests')
      if (!res.ok) {
        throw new Error(`Failed to load test data: ${res.status} ${res.statusText}`)
      }
      const data = await res.json()
      setHistory(data.history || [])
      const jobs = data.jobs || []
      const runningJob = jobs.find((j: TestJob) => j.status === 'running' || j.status === 'queued')
      if (runningJob) {
        setCurrentJob(runningJob)
        setIsRunning(runningJob.status === 'running')
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load test data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const detectFramework = useCallback(async () => {
    try {
      const res = await fetch(`/api/tests?detect=true&path=${encodeURIComponent(settings.projectPath || '')}`)
      if (res.ok) {
        const data = await res.json()
        setFramework(data.framework || 'unknown')
      }
    } catch {
      // Ignore
    }
  }, [settings.projectPath])

  useEffect(() => {
    loadTestData()
    detectFramework()
  }, [loadTestData, detectFramework])

  useEffect(() => {
    if (wsInitialized.current) return
    wsInitialized.current = true
    
    initWebSocket()
    
    const originalOnMessage = wsClient.onMessage
    wsClient.onMessage = (msg) => {
      originalOnMessage?.(msg)
      
      switch (msg.type) {
        case 'test-started':
          setIsRunning(true)
          setLiveOutput('')
          setFramework(msg.framework)
          break
        case 'test-output':
          setLiveOutput(prev => prev + msg.data)
          if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
          }
          break
        case 'test-completed':
          setIsRunning(false)
          setCurrentJob(null)
          setHistory(prev => [msg.summary, ...prev])
          break
        case 'test-error':
          setIsRunning(false)
          setCurrentJob(null)
          break
      }
    }
    
    return () => {
      wsClient.onMessage = originalOnMessage
    }
  }, [initWebSocket])

  const runTests = async (filter?: string) => {
    setIsRunning(true)
    setLiveOutput('')
    setRunError(null)
    
    try {
      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: settings.projectPath,
          filter,
        }),
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to start tests: ${res.status} ${res.statusText}`)
      }
      
      const data = await res.json()
      setCurrentJob({ id: data.jobId, status: 'running' } as TestJob)
      setFramework(data.framework)
    } catch (err) {
      setIsRunning(false)
      setRunError(err instanceof Error ? err.message : 'Failed to run tests. Please try again.')
    }
  }

  const cancelTests = async () => {
    if (!currentJob) return
    
    try {
      const res = await fetch(`/api/tests?jobId=${currentJob.id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error('Failed to cancel tests')
      }
      setIsRunning(false)
      setCurrentJob(null)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to cancel tests.')
    }
  }

  const rerunFailed = () => {
    const latestRun = history[0]
    if (!latestRun) return
    
    const failedTests = latestRun.results.filter(r => r.status === 'failed')
    if (failedTests.length === 0) return
    
    const filterPattern = failedTests.map(t => t.name).join('|')
    runTests(filterPattern)
  }

  const getFilteredResults = (results: TestResult[]) => {
    return results.filter(r => {
      // Task 4.1.2: Apply file filter
      if (fileFilter && r.file !== fileFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (searchFilter && !r.name.toLowerCase().includes(searchFilter.toLowerCase())) return false
      return true
    })
  }

  const getPaginatedResults = (results: TestResult[]) => {
    const filtered = getFilteredResults(results)
    const totalPages = Math.ceil(filtered.length / RESULTS_PER_PAGE)
    const startIndex = (currentPage - 1) * RESULTS_PER_PAGE
    const endIndex = startIndex + RESULTS_PER_PAGE
    return {
      results: filtered.slice(startIndex, endIndex),
      totalResults: filtered.length,
      totalPages,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, filtered.length),
    }
  }

  const getTestFiles = (results: TestResult[]): TestFile[] => {
    const fileMap = new Map<string, TestFile>()
    
    for (const result of results) {
      const path = result.file || 'unknown'
      const existing = fileMap.get(path) || {
        path,
        testCount: 0,
        passedCount: 0,
        failedCount: 0,
        skippedCount: 0,
      }
      
      existing.testCount++
      if (result.status === 'passed') existing.passedCount++
      else if (result.status === 'failed') existing.failedCount++
      else existing.skippedCount++
      
      fileMap.set(path, existing)
    }
    
    return Array.from(fileMap.values())
  }

  const getChartData = () => {
    return history.slice(0, 10).reverse().map((run, idx) => ({
      name: `#${idx + 1}`,
      passed: run.passed,
      failed: run.failed,
      skipped: run.skipped,
      total: run.total,
      passRate: run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0,
    }))
  }

  const getCoverageChartData = () => {
    return history.slice(0, 10).reverse().map((run, idx) => ({
      name: `#${idx + 1}`,
      lines: run.coverage?.summary.lines.pct ?? 0,
      branches: run.coverage?.summary.branches.pct ?? 0,
      functions: run.coverage?.summary.functions.pct ?? 0,
      statements: run.coverage?.summary.statements.pct ?? 0,
    }))
  }

  const getPassRatePercent = () => {
    const latestRun = history[0]
    if (!latestRun || latestRun.total === 0) return 0
    return Math.round((latestRun.passed / latestRun.total) * 100)
  }

  const latestRun = history[0]
  const latestCoverage = latestRun?.coverage
  const failedTests = latestRun?.results.filter(r => r.status === 'failed') || []

  const sortedCoverageFiles = useMemo(() => {
    if (!latestCoverage?.files) return []
    
    let files = [...latestCoverage.files]
    
    if (coverageSearchFilter) {
      const filter = coverageSearchFilter.toLowerCase()
      files = files.filter(f => f.path.toLowerCase().includes(filter))
    }
    
    files.sort((a, b) => {
      let aVal: number | string
      let bVal: number | string
      
      switch (coverageSortField) {
        case 'path':
          aVal = a.path
          bVal = b.path
          break
        case 'lines':
          aVal = a.lines.pct
          bVal = b.lines.pct
          break
        case 'branches':
          aVal = a.branches.pct
          bVal = b.branches.pct
          break
        case 'functions':
          aVal = a.functions.pct
          bVal = b.functions.pct
          break
        case 'statements':
          aVal = a.statements.pct
          bVal = b.statements.pct
          break
        default:
          aVal = a.lines.pct
          bVal = b.lines.pct
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return coverageSortDirection === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal)
      }
      
      return coverageSortDirection === 'asc' 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number)
    })
    
    return files
  }, [latestCoverage?.files, coverageSortField, coverageSortDirection, coverageSearchFilter])

  const handleCoverageSort = (field: SortField) => {
    if (coverageSortField === field) {
      setCoverageSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setCoverageSortField(field)
      setCoverageSortDirection('desc')
    }
  }

  // Task 5: Compare two test runs
  const comparisonResult = useMemo((): ComparisonResult | null => {
    if (!compareRun1 || !compareRun2) return null
    
    const run1 = history.find(h => h.id === compareRun1)
    const run2 = history.find(h => h.id === compareRun2)
    
    if (!run1 || !run2) return null
    
    const run1Results = new Map(run1.results.map(r => [r.name, r]))
    const run2Results = new Map(run2.results.map(r => [r.name, r]))
    
    const newFailures: TestResult[] = []
    const fixedTests: TestResult[] = []
    const unchangedFailures: TestResult[] = []
    const unchangedPasses: TestResult[] = []
    
    // Check all tests in run2 (newer run)
    for (const [name, result] of run2Results) {
      const oldResult = run1Results.get(name)
      
      if (result.status === 'failed') {
        if (!oldResult || oldResult.status !== 'failed') {
          newFailures.push(result)
        } else {
          unchangedFailures.push(result)
        }
      } else if (result.status === 'passed') {
        if (oldResult?.status === 'failed') {
          fixedTests.push(result)
        } else {
          unchangedPasses.push(result)
        }
      }
    }
    
    return { newFailures, fixedTests, unchangedFailures, unchangedPasses }
  }, [compareRun1, compareRun2, history])

  // Task 6: Filter and highlight search in output
  const highlightedOutput = useMemo(() => {
    if (!outputSearchQuery.trim() || !liveOutput) return liveOutput
    
    const query = outputSearchQuery.toLowerCase()
    const lines = liveOutput.split('\n')
    
    return lines.map(line => {
      if (line.toLowerCase().includes(query)) {
        return `>>> ${line}`
      }
      return line
    }).join('\n')
  }, [liveOutput, outputSearchQuery])

  const matchingLineCount = useMemo(() => {
    if (!outputSearchQuery.trim() || !liveOutput) return 0
    const query = outputSearchQuery.toLowerCase()
    return liveOutput.split('\n').filter(line => line.toLowerCase().includes(query)).length
  }, [liveOutput, outputSearchQuery])

  // Task 4.1.2: Get unique file paths from test results
  const uniqueFiles = useMemo(() => {
    if (!latestRun?.results) return []
    const files = new Set(latestRun.results.map(r => r.file).filter(Boolean))
    return Array.from(files).sort() as string[]
  }, [latestRun?.results])

  // Task 4.1.2: Filter results by selected file
  const filteredByFileResults = useMemo(() => {
    if (!latestRun?.results) return []
    if (!fileFilter) return latestRun.results
    return latestRun.results.filter(r => r.file === fileFilter)
  }, [latestRun?.results, fileFilter])

  // Task 4.1.1: Export helper function
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Task 4.1.1: Export to JSON
  const exportToJSON = () => {
    if (!latestRun) return
    const data = {
      timestamp: new Date().toISOString(),
      framework,
      results: filteredByFileResults,
      coverage: latestCoverage,
      summary: {
        total: filteredByFileResults.length,
        passed: filteredByFileResults.filter(r => r.status === 'passed').length,
        failed: filteredByFileResults.filter(r => r.status === 'failed').length,
        skipped: filteredByFileResults.filter(r => r.status === 'skipped').length,
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `test-results-${Date.now()}.json`)
  }

  // Task 4.1.1: Export to CSV
  const exportToCSV = () => {
    if (!latestRun) return
    const headers = ['Name', 'File', 'Status', 'Duration (ms)', 'Error']
    const rows = filteredByFileResults.map(r => [
      `"${r.name.replace(/"/g, '""')}"`,
      `"${(r.file || '').replace(/"/g, '""')}"`,
      r.status,
      r.duration?.toString() || '',
      `"${(r.error?.replace(/"/g, '""').replace(/\n/g, ' ') || '')}"`
    ])
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    downloadBlob(blob, `test-results-${Date.now()}.csv`)
  }

  // Task 4.1.1: Export to HTML
  const exportToHTML = () => {
    if (!latestRun) return
    const passed = filteredByFileResults.filter(r => r.status === 'passed').length
    const failed = filteredByFileResults.filter(r => r.status === 'failed').length
    const skipped = filteredByFileResults.filter(r => r.status === 'skipped').length
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Results - ${new Date().toLocaleDateString()}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    .summary { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { background: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-value { font-size: 24px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .skipped { color: #eab308; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #f8f8f8; text-align: left; padding: 12px; font-weight: 600; border-bottom: 2px solid #eee; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    tr:hover { background: #fafafa; }
    .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .status-passed { background: #dcfce7; color: #166534; }
    .status-failed { background: #fee2e2; color: #991b1b; }
    .status-skipped { background: #fef9c3; color: #854d0e; }
    .error { font-family: monospace; font-size: 12px; color: #991b1b; white-space: pre-wrap; max-width: 400px; overflow: hidden; text-overflow: ellipsis; }
  </style>
</head>
<body>
  <h1>Test Results Report</h1>
  <p>Generated: ${new Date().toLocaleString()} | Framework: ${framework}</p>
  
  <div class="summary">
    <div class="stat">
      <div class="stat-value">${filteredByFileResults.length}</div>
      <div class="stat-label">Total Tests</div>
    </div>
    <div class="stat">
      <div class="stat-value passed">${passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat">
      <div class="stat-value failed">${failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat">
      <div class="stat-value skipped">${skipped}</div>
      <div class="stat-label">Skipped</div>
    </div>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Test Name</th>
        <th>File</th>
        <th>Duration</th>
        <th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${filteredByFileResults.map(r => `
      <tr>
        <td><span class="status-badge status-${r.status}">${r.status.toUpperCase()}</span></td>
        <td>${r.name}</td>
        <td>${r.file || '-'}</td>
        <td>${r.duration ? `${r.duration}ms` : '-'}</td>
        <td class="error">${r.error ? r.error.slice(0, 200) + (r.error.length > 200 ? '...' : '') : '-'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`
    const blob = new Blob([html], { type: 'text/html' })
    downloadBlob(blob, `test-results-${Date.now()}.html`)
  }

  // Task 4.2.1: Analyze flaky tests across runs
  const analyzeFlakyTests = useCallback((testHistory: TestRunSummary[]): FlakyTestInfo[] => {
    const testStats = new Map<string, { passes: number; fails: number; file?: string }>()
    
    // Analyze last 10 runs
    const recentRuns = testHistory.slice(0, 10)
    
    for (const run of recentRuns) {
      for (const result of run.results) {
        const key = `${result.file}:${result.name}`
        const stats = testStats.get(key) || { passes: 0, fails: 0, file: result.file }
        if (result.status === 'passed') stats.passes++
        else if (result.status === 'failed') stats.fails++
        testStats.set(key, stats)
      }
    }
    
    return Array.from(testStats.entries())
      .filter(([_, stats]) => stats.passes > 0 && stats.fails > 0) // Only tests that both passed and failed
      .map(([name, stats]) => ({
        name: name.split(':')[1] || name,
        file: stats.file,
        passCount: stats.passes,
        failCount: stats.fails,
        flakyScore: Math.round((Math.min(stats.passes, stats.fails) / (stats.passes + stats.fails)) * 100),
      }))
      .sort((a, b) => b.flakyScore - a.flakyScore)
  }, [])

  const flakyTests = useMemo(() => analyzeFlakyTests(history), [analyzeFlakyTests, history])

  // Create a set of flaky test names for quick lookup
  const flakyTestNames = useMemo(() => {
    return new Set(flakyTests.map(t => t.name))
  }, [flakyTests])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (coverageSortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-muted" />
    }
    return coverageSortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card/40 p-5">
          <LoadingState
            variant="workflow"
            size="lg"
            text="Loading quality data..."
            steps={['Discover', 'Analyze', 'Compose', 'Ready']}
            activeStep={2}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Error States */}
      {loadError && (
        <InlineError error={loadError} onRetry={loadTestData} />
      )}
      {runError && (
        <InlineError error={runError} onRetry={() => runTests()} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TestTube2 className="h-5 w-5 text-primary" />
            Testing Dashboard
          </h2>
          <p className="text-sm text-muted mt-1">
            {framework !== 'unknown' ? `Framework: ${framework}` : 'Run and monitor your tests'}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Task 4.1.1: Export dropdown */}
          {latestRun && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Export
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToJSON}>
                  <FileJson className="h-4 w-4 text-blue-500" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToCSV}>
                  <FileSpreadsheet className="h-4 w-4 text-green-500" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportToHTML}>
                  <Globe className="h-4 w-4 text-purple-500" />
                  Export as HTML Report
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={cancelTests}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
          ) : (
            <>
              <Button variant="default" size="sm" onClick={() => runTests()} data-testid="run-tests-button">
                <Play className="h-4 w-4" />
                Run Tests
              </Button>
              {failedTests.length > 0 && (
                <Button variant="outline" size="sm" onClick={rerunFailed}>
                  <RefreshCw className="h-4 w-4" />
                  Re-run Failed ({failedTests.length})
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Total Tests</p>
                <p className="text-2xl font-bold text-foreground">{latestRun?.total || 0}</p>
              </div>
              <TestTube2 className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Passed</p>
                <p className="text-2xl font-bold text-green-500">{latestRun?.passed || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Failed</p>
                <p className="text-2xl font-bold text-red-500">{latestRun?.failed || 0}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Pass Rate</p>
                <p className="text-2xl font-bold text-foreground">{getPassRatePercent()}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Button
          variant={activeTab === 'results' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('results')}
          className="gap-2"
        >
          <TestTube2 className="h-4 w-4" />
          Results
        </Button>
        <Button
          variant={activeTab === 'coverage' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('coverage')}
          className="gap-2"
        >
          <Shield className="h-4 w-4" />
          Coverage
          {latestCoverage && (
            <Badge 
              variant={getCoverageBadgeVariant(latestCoverage.summary.lines.pct)}
              className="ml-1 text-[10px]"
            >
              {Math.round(latestCoverage.summary.lines.pct)}%
            </Badge>
          )}
        </Button>
        <Button
          variant={activeTab === 'trends' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('trends')}
          className="gap-2"
        >
          <TrendingUp className="h-4 w-4" />
          Trends
        </Button>
        <Button
          variant={activeTab === 'compare' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('compare')}
          className="gap-2"
          disabled={history.length < 2}
          title={history.length < 2 ? 'Need at least 2 test runs to compare' : 'Compare test runs'}
        >
          <BarChart3 className="h-4 w-4" />
          Compare
        </Button>
      </div>

      {/* Pass Rate Progress Bar */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Test Pass Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Pass Rate</span>
              <span className="font-medium">{getPassRatePercent()}%</span>
            </div>
            <div className="h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-green-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${getPassRatePercent()}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{latestRun?.passed || 0} passed</span>
              <span>{latestRun?.skipped || 0} skipped</span>
              <span>{latestRun?.failed || 0} failed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Output with Search */}
      {(isRunning || liveOutput) && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {isRunning && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                <span>Test Output</span>
                {isRunning && <Badge variant="outline" className="text-xs">Running</Badge>}
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted" />
                  <Input
                    placeholder="Search output..."
                    value={outputSearchQuery}
                    onChange={(e) => setOutputSearchQuery(e.target.value)}
                    className="h-7 w-40 pl-7 text-xs"
                  />
                </div>
                {outputSearchQuery && matchingLineCount > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {matchingLineCount} matches
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre
              ref={outputRef}
              className="bg-secondary/50 rounded-lg p-4 text-xs font-mono text-foreground overflow-auto max-h-64 whitespace-pre-wrap"
              aria-live="polite"
              role="log"
              aria-label="Test output"
            >
              {outputSearchQuery ? highlightedOutput : (liveOutput || 'Waiting for output...')}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Coverage Tab Content */}
      {activeTab === 'coverage' && (
        <div className="space-y-4">
          {/* Coverage Summary Cards */}
          {latestCoverage ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted uppercase tracking-wider">Lines</p>
                      <FileText className="h-4 w-4 text-muted" />
                    </div>
                    <p className={cn('text-2xl font-bold', getCoverageColor(latestCoverage.summary.lines.pct))}>
                      {Math.round(latestCoverage.summary.lines.pct)}%
                    </p>
                    <Progress 
                      value={latestCoverage.summary.lines.pct} 
                      className="mt-2 h-1.5"
                      indicatorClassName={getCoverageBarColor(latestCoverage.summary.lines.pct)}
                    />
                    <p className="text-xs text-muted mt-1">
                      {latestCoverage.summary.lines.covered}/{latestCoverage.summary.lines.total}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted uppercase tracking-wider">Branches</p>
                      <GitBranch className="h-4 w-4 text-muted" />
                    </div>
                    <p className={cn('text-2xl font-bold', getCoverageColor(latestCoverage.summary.branches.pct))}>
                      {Math.round(latestCoverage.summary.branches.pct)}%
                    </p>
                    <Progress 
                      value={latestCoverage.summary.branches.pct} 
                      className="mt-2 h-1.5"
                      indicatorClassName={getCoverageBarColor(latestCoverage.summary.branches.pct)}
                    />
                    <p className="text-xs text-muted mt-1">
                      {latestCoverage.summary.branches.covered}/{latestCoverage.summary.branches.total}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted uppercase tracking-wider">Functions</p>
                      <Code2 className="h-4 w-4 text-muted" />
                    </div>
                    <p className={cn('text-2xl font-bold', getCoverageColor(latestCoverage.summary.functions.pct))}>
                      {Math.round(latestCoverage.summary.functions.pct)}%
                    </p>
                    <Progress 
                      value={latestCoverage.summary.functions.pct} 
                      className="mt-2 h-1.5"
                      indicatorClassName={getCoverageBarColor(latestCoverage.summary.functions.pct)}
                    />
                    <p className="text-xs text-muted mt-1">
                      {latestCoverage.summary.functions.covered}/{latestCoverage.summary.functions.total}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-muted uppercase tracking-wider">Statements</p>
                      <Percent className="h-4 w-4 text-muted" />
                    </div>
                    <p className={cn('text-2xl font-bold', getCoverageColor(latestCoverage.summary.statements.pct))}>
                      {Math.round(latestCoverage.summary.statements.pct)}%
                    </p>
                    <Progress 
                      value={latestCoverage.summary.statements.pct} 
                      className="mt-2 h-1.5"
                      indicatorClassName={getCoverageBarColor(latestCoverage.summary.statements.pct)}
                    />
                    <p className="text-xs text-muted mt-1">
                      {latestCoverage.summary.statements.covered}/{latestCoverage.summary.statements.total}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* File Coverage Table */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileCode2 className="h-4 w-4 text-primary" />
                      File Coverage ({sortedCoverageFiles.length} files)
                    </CardTitle>
                    <Input
                      placeholder="Search files..."
                      value={coverageSearchFilter}
                      onChange={(e) => setCoverageSearchFilter(e.target.value)}
                      className="h-7 w-48 text-xs"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b border-border">
                          <th 
                            className="text-left p-2 cursor-pointer hover:bg-secondary/50 transition-colors"
                            onClick={() => handleCoverageSort('path')}
                          >
                            <div className="flex items-center gap-1">
                              File <SortIcon field="path" />
                            </div>
                          </th>
                          <th 
                            className="text-right p-2 cursor-pointer hover:bg-secondary/50 transition-colors w-24"
                            onClick={() => handleCoverageSort('lines')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Lines <SortIcon field="lines" />
                            </div>
                          </th>
                          <th 
                            className="text-right p-2 cursor-pointer hover:bg-secondary/50 transition-colors w-24"
                            onClick={() => handleCoverageSort('branches')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Branches <SortIcon field="branches" />
                            </div>
                          </th>
                          <th 
                            className="text-right p-2 cursor-pointer hover:bg-secondary/50 transition-colors w-24 hidden md:table-cell"
                            onClick={() => handleCoverageSort('functions')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Functions <SortIcon field="functions" />
                            </div>
                          </th>
                          <th 
                            className="text-right p-2 cursor-pointer hover:bg-secondary/50 transition-colors w-24 hidden lg:table-cell"
                            onClick={() => handleCoverageSort('statements')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Statements <SortIcon field="statements" />
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCoverageFiles.map((file) => (
                          <tr 
                            key={file.path} 
                            className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                          >
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <FileCode2 className="h-3.5 w-3.5 text-muted shrink-0" />
                                <span className="truncate text-xs font-mono" title={file.path}>
                                  {file.path.split('/').pop() || file.path}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted truncate ml-5" title={file.path}>
                                {file.path}
                              </p>
                            </td>
                            <td className="p-2 text-right">
                              <span className={cn('font-medium', getCoverageColor(file.lines.pct))}>
                                {Math.round(file.lines.pct)}%
                              </span>
                            </td>
                            <td className="p-2 text-right">
                              <span className={cn('font-medium', getCoverageColor(file.branches.pct))}>
                                {Math.round(file.branches.pct)}%
                              </span>
                            </td>
                            <td className="p-2 text-right hidden md:table-cell">
                              <span className={cn('font-medium', getCoverageColor(file.functions.pct))}>
                                {Math.round(file.functions.pct)}%
                              </span>
                            </td>
                            <td className="p-2 text-right hidden lg:table-cell">
                              <span className={cn('font-medium', getCoverageColor(file.statements.pct))}>
                                {Math.round(file.statements.pct)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {sortedCoverageFiles.length === 0 && (
                      <p className="text-sm text-muted py-8 text-center">
                        {coverageSearchFilter ? 'No files match your search.' : 'No file coverage data available.'}
                      </p>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Coverage Trend Chart */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Coverage Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {history.filter(h => h.coverage).length < 2 ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <p className="text-sm text-muted">Run more tests with coverage to see trends.</p>
                    </div>
                  ) : (
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={getCoverageChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <XAxis 
                            dataKey="name" 
                            tick={{ fontSize: 10, fill: 'var(--muted)' }}
                            axisLine={{ stroke: 'var(--border)' }}
                            tickLine={false}
                          />
                          <YAxis 
                            domain={[0, 100]}
                            tick={{ fontSize: 10, fill: 'var(--muted)' }}
                            axisLine={{ stroke: 'var(--border)' }}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                            labelStyle={{ color: 'var(--foreground)' }}
                            formatter={(value) => [`${Math.round(Number(value) || 0)}%`]}
                          />
                          <Line type="monotone" dataKey="lines" stroke="#22c55e" strokeWidth={2} dot={false} name="Lines" />
                          <Line type="monotone" dataKey="branches" stroke="#3b82f6" strokeWidth={2} dot={false} name="Branches" />
                          <Line type="monotone" dataKey="functions" stroke="#a855f7" strokeWidth={2} dot={false} name="Functions" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-border">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <Shield className="h-12 w-12 text-muted" />
                  <div>
                    <h3 className="text-lg font-medium text-foreground">No Coverage Data</h3>
                    <p className="text-sm text-muted mt-1">
                      Run tests to generate code coverage data. Coverage is automatically collected when running tests.
                    </p>
                  </div>
                  <Button variant="default" size="sm" onClick={() => runTests()}>
                    <Play className="h-4 w-4" />
                    Run Tests with Coverage
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Results Tab Content */}
      {activeTab === 'results' && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Test Results */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Test Results
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Task 4.1.2: File filter dropdown */}
                {uniqueFiles.length > 0 && (
                  <Select
                    value={fileFilter || 'all'}
                    onValueChange={(value) => {
                      setFileFilter(value === 'all' ? null : value)
                      setCurrentPage(1)
                    }}
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <Filter className="h-3 w-3 mr-1" />
                      <SelectValue placeholder="All files" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All files</SelectItem>
                      {uniqueFiles.map((file) => (
                        <SelectItem key={file} value={file} className="text-xs">
                          {file.split('/').pop() || file}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  placeholder="Search tests..."
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-7 w-32 text-xs"
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setStatusFilter('all')
                      setCurrentPage(1)
                    }}
                  >
                    All
                  </Button>
                  <Button
                    variant={statusFilter === 'passed' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setStatusFilter('passed')
                      setCurrentPage(1)
                    }}
                  >
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  </Button>
                  <Button
                    variant={statusFilter === 'failed' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setStatusFilter('failed')
                      setCurrentPage(1)
                    }}
                  >
                    <XCircle className="h-3 w-3 text-red-500" />
                  </Button>
                  <Button
                    variant={statusFilter === 'skipped' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setStatusFilter('skipped')
                      setCurrentPage(1)
                    }}
                  >
                    <MinusCircle className="h-3 w-3 text-yellow-500" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]" data-testid="test-results">
              {!latestRun ? (
                <EmptyState
                  icon={<TestTube2 />}
                  title="No test results yet"
                  description="Run your tests to see results and track pass/fail status."
                  variant="compact"
                  action={{
                    label: 'Run Tests',
                    onClick: () => runTests(),
                    icon: <Play className="h-4 w-4" />,
                  }}
                />
              ) : (
                <div className="space-y-1">
                  {(() => {
                    const { results: paginatedResults, totalResults, totalPages, startIndex, endIndex } = getPaginatedResults(latestRun.results)
                    return (
                      <>
                        {paginatedResults.map((result) => {
                          const errorInfo = result.status === 'failed' ? getErrorSummary(result.error || result.stackTrace) : null
                          return (
                            <Collapsible
                              key={result.id}
                              open={expandedTestId === result.id}
                              onOpenChange={() => setExpandedTestId(expandedTestId === result.id ? null : result.id)}
                            >
                              <CollapsibleTrigger asChild>
                                <div
                                  className={cn(
                                    'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                                    'hover:bg-secondary/50',
                                    result.status === 'failed' && 'bg-red-500/5'
                                  )}
                                >
                                  {result.status === 'passed' && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" aria-label="Test passed" />}
                                  {result.status === 'failed' && <XCircle className="h-4 w-4 text-red-500 shrink-0" aria-label="Test failed" />}
                                  {result.status === 'skipped' && <MinusCircle className="h-4 w-4 text-yellow-500 shrink-0" aria-label="Test skipped" />}
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
                                      {flakyTestNames.has(result.name) && (
                                        <Badge className="text-[9px] px-1.5 py-0 h-4 bg-yellow-500 text-yellow-950 hover:bg-yellow-500 shrink-0">
                                          Flaky
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted truncate">{result.file}</p>
                                  </div>
                                  
                                  <span className="text-xs text-muted shrink-0">{result.duration}ms</span>
                                  
                                  {(result.error || result.stackTrace) && (
                                    expandedTestId === result.id 
                                      ? <ChevronDown className="h-4 w-4 text-muted shrink-0" />
                                      : <ChevronRight className="h-4 w-4 text-muted shrink-0" />
                                  )}
                                </div>
                              </CollapsibleTrigger>
                              
                              {(result.error || result.stackTrace) && (
                                <CollapsibleContent>
                                  <div className="ml-6 mt-1 mb-2 p-3 bg-red-500/10 rounded-lg border border-red-500/20 space-y-3">
                                    {/* Error Summary - Gap G-TEST-01 */}
                                    {errorInfo && (
                                      <div className="p-2 bg-red-500/5 rounded border border-red-500/10">
                                        <div className="flex items-start gap-2">
                                          <Zap className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                                          <div>
                                            <p className="text-xs font-semibold text-red-400">Summary: {errorInfo.summary}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Suggested Action - Gap G-TEST-01 */}
                                    {errorInfo && (
                                      <div className="p-2 bg-amber-500/5 rounded border border-amber-500/10">
                                        <div className="flex items-start gap-2">
                                          <Lightbulb className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                                          <div>
                                            <p className="text-xs font-semibold text-amber-400">Suggested Action:</p>
                                            <p className="text-xs text-foreground mt-0.5">{errorInfo.action}</p>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {result.error && (
                                      <div>
                                        <p className="text-xs font-medium text-red-400 mb-1">Error:</p>
                                        <p className="text-xs text-foreground font-mono whitespace-pre-wrap">{result.error}</p>
                                      </div>
                                    )}
                                    {result.stackTrace && (
                                      <div>
                                        <p className="text-xs font-medium text-red-400 mb-1">Stack Trace:</p>
                                        <pre className="text-xs text-muted font-mono whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
                                          {result.stackTrace}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                </CollapsibleContent>
                              )}
                            </Collapsible>
                          )
                        })}
                        
                        {/* Pagination Controls - Gap G-TEST-02 */}
                        {totalResults > RESULTS_PER_PAGE && (
                          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                            <p className="text-xs text-muted">
                              Showing {startIndex}-{endIndex} of {totalResults} results
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum: number
                                if (totalPages <= 5) {
                                  pageNum = i + 1
                                } else if (currentPage <= 3) {
                                  pageNum = i + 1
                                } else if (currentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i
                                } else {
                                  pageNum = currentPage - 2 + i
                                }
                                return (
                                  <Button
                                    key={pageNum}
                                    variant={currentPage === pageNum ? 'secondary' : 'ghost'}
                                    size="sm"
                                    className="h-7 w-7 p-0 text-xs"
                                    onClick={() => setCurrentPage(pageNum)}
                                  >
                                    {pageNum}
                                  </Button>
                                )
                              })}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Test Files */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-primary" />
              Test Files
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {!latestRun ? (
                <EmptyState
                  icon={<FolderTree />}
                  title="No test files detected"
                  description="Run tests to detect test files in your project."
                  variant="compact"
                />
              ) : (
                <div className="space-y-2">
                  {getTestFiles(latestRun.results).map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <FileCode2 className="h-4 w-4 text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{file.path || 'Unknown'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-green-500">{file.passedCount} passed</span>
                          {file.failedCount > 0 && (
                            <span className="text-xs text-red-500">{file.failedCount} failed</span>
                          )}
                          {file.skippedCount > 0 && (
                            <span className="text-xs text-yellow-500">{file.skippedCount} skipped</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted">{file.testCount} tests</div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Task 4.2.2: Flaky Tests Section */}
      {flakyTests.length > 0 && (
        <Card className="border-yellow-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Flaky Tests ({flakyTests.length})
            </CardTitle>
            <p className="text-xs text-muted mt-1">
              Tests that pass and fail inconsistently across the last 10 runs
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[250px]">
              <div className="space-y-2">
                {flakyTests.map(test => (
                  <div 
                    key={`${test.file}:${test.name}`} 
                    className="flex items-center justify-between p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20 hover:bg-yellow-500/10 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                        <span className="font-medium text-sm text-foreground truncate">{test.name}</span>
                      </div>
                      {test.file && (
                        <span className="text-xs text-muted ml-5 block truncate">{test.file}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
                        {test.passCount} passed
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
                        {test.failCount} failed
                      </Badge>
                      <Badge className="text-[10px] bg-yellow-500 text-yellow-950 hover:bg-yellow-500">
                        {test.flakyScore}% flaky
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Test History - shown in Results tab */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Test History */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Test History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              {history.length === 0 ? (
                <EmptyState
                  icon={<Clock />}
                  title="No test runs yet"
                  description="Your test run history will appear here."
                  variant="compact"
                />
              ) : (
                <div className="space-y-2">
                  {history.map((run) => (
                    <Collapsible
                      key={run.id}
                      open={expandedRunId === run.id}
                      onOpenChange={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/30 cursor-pointer transition-colors">
                          <div className="flex items-center gap-3">
                            {expandedRunId === run.id 
                              ? <ChevronDown className="h-4 w-4 text-muted" />
                              : <ChevronRight className="h-4 w-4 text-muted" />
                            }
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {new Date(run.timestamp).toLocaleString()}
                              </p>
                              <p className="text-xs text-muted">
                                {run.framework} • {Math.round(run.duration / 1000)}s
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
                              {run.passed} passed
                            </Badge>
                            {run.failed > 0 && (
                              <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
                                {run.failed} failed
                              </Badge>
                            )}
                            {run.skipped > 0 && (
                              <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30">
                                {run.skipped} skipped
                              </Badge>
                            )}
                            {/* Coverage Badge */}
                            {run.coverage && (
                              <Badge 
                                variant={getCoverageBadgeVariant(run.coverage.summary.lines.pct)}
                                className="text-[10px]"
                              >
                                {Math.round(run.coverage.summary.lines.pct)}% cov
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="ml-7 mt-2 mb-2 space-y-1">
                          {run.results.slice(0, 10).map((result) => (
                            <div key={result.id} className="flex items-center gap-2 text-xs py-1">
                              {result.status === 'passed' && <CheckCircle2 className="h-3 w-3 text-green-500" aria-label="Test passed" />}
                              {result.status === 'failed' && <XCircle className="h-3 w-3 text-red-500" aria-label="Test failed" />}
                              {result.status === 'skipped' && <MinusCircle className="h-3 w-3 text-yellow-500" aria-label="Test skipped" />}
                              <span className="text-muted truncate">{result.name}</span>
                            </div>
                          ))}
                          {run.results.length > 10 && (
                            <p className="text-xs text-muted">...and {run.results.length - 10} more</p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Quick Trend Chart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Test Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length < 2 ? (
              <div className="h-[250px] flex items-center justify-center">
                <p className="text-sm text-muted">Run more tests to see trends.</p>
              </div>
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="passedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: 'var(--muted)' }}
                      axisLine={{ stroke: 'var(--border)' }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="passed"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#passedGradient)"
                      name="Passed"
                    />
                    <Area
                      type="monotone"
                      dataKey="failed"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#failedGradient)"
                      name="Failed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failures Panel */}
      {failedTests.length > 0 && (
        <Card className="border-red-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-4 w-4" />
              Failed Tests ({failedTests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {failedTests.map((test) => {
                const errorInfo = getErrorSummary(test.error || test.stackTrace)
                return (
                  <div
                    key={test.id}
                    className="p-3 rounded-lg bg-red-500/5 border border-red-500/20"
                  >
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" aria-label="Test failed" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{test.name}</p>
                          <p className="text-xs text-muted">{test.file}</p>
                        </div>
                        
                        {/* Error Summary */}
                        <div className="p-2 bg-red-500/10 rounded border border-red-500/20">
                          <div className="flex items-start gap-2">
                            <Zap className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                            <p className="text-xs font-medium text-red-400">{errorInfo.summary}</p>
                          </div>
                        </div>
                        
                        {/* Suggested Action */}
                        <div className="p-2 bg-amber-500/10 rounded border border-amber-500/20">
                          <div className="flex items-start gap-2">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-amber-400">Suggested Action:</p>
                              <p className="text-xs text-foreground mt-0.5">{errorInfo.action}</p>
                            </div>
                          </div>
                        </div>
                        
                        {test.error && (
                          <details className="text-xs">
                            <summary className="text-red-400 cursor-pointer hover:text-red-300">View full error</summary>
                            <p className="text-red-400 mt-2 font-mono whitespace-pre-wrap pl-2 border-l-2 border-red-500/30">
                              {test.error}
                            </p>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}

      {/* Trends Tab Content */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Test Pass/Fail Trend */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TestTube2 className="h-4 w-4 text-primary" />
                  Test Results Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.length < 2 ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-sm text-muted">Run more tests to see trends.</p>
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={getChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="passedGradientTrend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="failedGradientTrend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="skippedGradientTrend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          axisLine={{ stroke: 'var(--border)' }}
                          tickLine={false}
                        />
                        <YAxis 
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          axisLine={{ stroke: 'var(--border)' }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: 'var(--foreground)' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="passed"
                          stroke="#22c55e"
                          strokeWidth={2}
                          fill="url(#passedGradientTrend)"
                          name="Passed"
                        />
                        <Area
                          type="monotone"
                          dataKey="failed"
                          stroke="#ef4444"
                          strokeWidth={2}
                          fill="url(#failedGradientTrend)"
                          name="Failed"
                        />
                        <Area
                          type="monotone"
                          dataKey="skipped"
                          stroke="#eab308"
                          strokeWidth={2}
                          fill="url(#skippedGradientTrend)"
                          name="Skipped"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Coverage Trend */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Coverage Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {history.filter(h => h.coverage).length < 2 ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <p className="text-sm text-muted">Run more tests with coverage to see trends.</p>
                  </div>
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getCoverageChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          axisLine={{ stroke: 'var(--border)' }}
                          tickLine={false}
                        />
                        <YAxis 
                          domain={[0, 100]}
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          axisLine={{ stroke: 'var(--border)' }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                          labelStyle={{ color: 'var(--foreground)' }}
                          formatter={(value) => [`${Math.round(Number(value) || 0)}%`]}
                        />
                        <Line type="monotone" dataKey="lines" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Lines" />
                        <Line type="monotone" dataKey="branches" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Branches" />
                        <Line type="monotone" dataKey="functions" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} name="Functions" />
                        <Line type="monotone" dataKey="statements" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Statements" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pass Rate Trend */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                Pass Rate Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length < 2 ? (
                <div className="h-[200px] flex items-center justify-center">
                  <p className="text-sm text-muted">Run more tests to see pass rate trends.</p>
                </div>
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={getChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="passRateGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis 
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: 'var(--foreground)' }}
                        formatter={(value) => [`${value ?? 0}%`]}
                      />
                      <Area
                        type="monotone"
                        dataKey="passRate"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#passRateGradient)"
                        name="Pass Rate"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test Run History Table */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Test Run History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Framework</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">Passed</th>
                      <th className="text-right p-2">Failed</th>
                      <th className="text-right p-2">Pass Rate</th>
                      <th className="text-right p-2 hidden md:table-cell">Coverage</th>
                      <th className="text-right p-2 hidden lg:table-cell">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((run) => {
                      const passRate = run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0
                      return (
                        <tr key={run.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="p-2 text-xs">
                            {new Date(run.timestamp).toLocaleDateString()}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-[10px]">{run.framework}</Badge>
                          </td>
                          <td className="p-2 text-right font-medium">{run.total}</td>
                          <td className="p-2 text-right text-green-500">{run.passed}</td>
                          <td className="p-2 text-right text-red-500">{run.failed}</td>
                          <td className="p-2 text-right">
                            <span className={cn('font-medium', getCoverageColor(passRate))}>
                              {passRate}%
                            </span>
                          </td>
                          <td className="p-2 text-right hidden md:table-cell">
                            {run.coverage ? (
                              <span className={cn('font-medium', getCoverageColor(run.coverage.summary.lines.pct))}>
                                {Math.round(run.coverage.summary.lines.pct)}%
                              </span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td className="p-2 text-right text-muted hidden lg:table-cell">
                            {(run.duration / 1000).toFixed(1)}s
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {history.length === 0 && (
                  <EmptyState
                    icon={<Clock />}
                    title="No test runs yet"
                    description="Run tests to see your history here."
                    variant="compact"
                  />
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compare Tab Content */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          {/* Run Selection */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Select Test Runs to Compare
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs text-muted mb-1 block">Older Run (Baseline)</label>
                  <select
                    value={compareRun1 || ''}
                    onChange={(e) => setCompareRun1(e.target.value || null)}
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground"
                  >
                    <option value="">Select a run...</option>
                    {history.map((run) => (
                      <option key={run.id} value={run.id} disabled={run.id === compareRun2}>
                        {new Date(run.timestamp).toLocaleString()} - {run.passed}/{run.total} passed
                      </option>
                    ))}
                  </select>
                </div>
                <ArrowRightLeft className="h-5 w-5 text-muted shrink-0 mt-5" />
                <div className="flex-1">
                  <label className="text-xs text-muted mb-1 block">Newer Run (Current)</label>
                  <select
                    value={compareRun2 || ''}
                    onChange={(e) => setCompareRun2(e.target.value || null)}
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground"
                  >
                    <option value="">Select a run...</option>
                    {history.map((run) => (
                      <option key={run.id} value={run.id} disabled={run.id === compareRun1}>
                        {new Date(run.timestamp).toLocaleString()} - {run.passed}/{run.total} passed
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Comparison Results */}
          {comparisonResult && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-red-500/30 bg-red-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-red-400 uppercase tracking-wider">New Failures</p>
                        <p className="text-2xl font-bold text-red-500">{comparisonResult.newFailures.length}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-red-500/30" />
                    </div>
                    <p className="text-xs text-muted mt-1">Tests that started failing</p>
                  </CardContent>
                </Card>

                <Card className="border-green-500/30 bg-green-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-400 uppercase tracking-wider">Fixed Tests</p>
                        <p className="text-2xl font-bold text-green-500">{comparisonResult.fixedTests.length}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-green-500/30" />
                    </div>
                    <p className="text-xs text-muted mt-1">Tests that are now passing</p>
                  </CardContent>
                </Card>

                <Card className="border-yellow-500/30 bg-yellow-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-yellow-400 uppercase tracking-wider">Still Failing</p>
                        <p className="text-2xl font-bold text-yellow-500">{comparisonResult.unchangedFailures.length}</p>
                      </div>
                      <XCircle className="h-8 w-8 text-yellow-500/30" />
                    </div>
                    <p className="text-xs text-muted mt-1">Tests that remain broken</p>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider">Still Passing</p>
                        <p className="text-2xl font-bold text-foreground">{comparisonResult.unchangedPasses.length}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-muted/30" />
                    </div>
                    <p className="text-xs text-muted mt-1">Tests that remain stable</p>
                  </CardContent>
                </Card>
              </div>

              {/* New Failures (Regressions) */}
              {comparisonResult.newFailures.length > 0 && (
                <Card className="border-red-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-500">
                      <AlertTriangle className="h-4 w-4" />
                      New Failures (Regressions) - {comparisonResult.newFailures.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-2">
                        {comparisonResult.newFailures.map((test) => (
                          <div
                            key={test.id}
                            className="p-3 rounded-lg bg-red-500/10 border border-red-500/20"
                          >
                            <div className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" aria-label="Test failed" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{test.name}</p>
                                <p className="text-xs text-muted">{test.file}</p>
                                {test.error && (
                                  <p className="text-xs text-red-400 mt-1 truncate">{test.error}</p>
                                )}
                              </div>
                              <Badge variant="destructive" className="text-[10px] shrink-0">
                                REGRESSION
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Fixed Tests */}
              {comparisonResult.fixedTests.length > 0 && (
                <Card className="border-green-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-500">
                      <CheckCircle2 className="h-4 w-4" />
                      Fixed Tests - {comparisonResult.fixedTests.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[200px]">
                      <div className="space-y-2">
                        {comparisonResult.fixedTests.map((test) => (
                          <div
                            key={test.id}
                            className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2"
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" aria-label="Test passed" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{test.name}</p>
                              <p className="text-xs text-muted truncate">{test.file}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30 shrink-0">
                              FIXED
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Unchanged Failures */}
              {comparisonResult.unchangedFailures.length > 0 && (
                <Card className="border-yellow-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-500">
                      <XCircle className="h-4 w-4" />
                      Still Failing - {comparisonResult.unchangedFailures.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[200px]">
                      <div className="space-y-2">
                        {comparisonResult.unchangedFailures.map((test) => (
                          <div
                            key={test.id}
                            className="p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 flex items-center gap-2"
                          >
                            <XCircle className="h-4 w-4 text-yellow-500 shrink-0" aria-label="Test still failing" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{test.name}</p>
                              <p className="text-xs text-muted truncate">{test.file}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!comparisonResult && compareRun1 && compareRun2 && (
            <Card className="border-border">
              <CardContent className="p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">Loading comparison...</p>
              </CardContent>
            </Card>
          )}

          {(!compareRun1 || !compareRun2) && (
            <Card className="border-border">
              <CardContent className="p-8 text-center">
                <GitCompare className="h-12 w-12 text-muted mx-auto mb-3" />
                <h3 className="text-lg font-medium text-foreground mb-1">Compare Test Runs</h3>
                <p className="text-sm text-muted max-w-md mx-auto">
                  Select two test runs above to see what changed between them. 
                  This helps you identify regressions (new failures) and fixes.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
