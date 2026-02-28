'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { ErrorState } from '@/components/ui/error-state'
import { NoDataState } from '@/components/ui/no-data-state'
import { useSwarmStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { IdeasWorkspace } from '@/components/ideas-workspace'
import {
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Layers,
  Activity,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'

const TestingDashboard = dynamic(
  () => import('@/components/testing-dashboard').then((mod) => ({ default: mod.TestingDashboard })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/70 bg-background/40 p-4">
        <LoadingState
          variant="workflow"
          size="md"
          text="Preparing quality surface..."
          steps={['Tests', 'Coverage', 'Readiness']}
          activeStep={1}
        />
      </div>
    ),
  }
)

const ObservabilityDashboard = dynamic(
  () => import('@/components/observability-dashboard').then((mod) => ({ default: mod.ObservabilityDashboard })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/70 bg-background/40 p-4">
        <LoadingState
          variant="workflow"
          size="md"
          text="Preparing operations surface..."
          steps={['Metrics', 'Pipelines', 'Alerts']}
          activeStep={1}
        />
      </div>
    ),
  }
)

interface DashboardSummary {
  tasks: number
  tickets: number
  projects: number
  assistants: number
  quota: {
    tier: 'free' | 'pro' | 'team' | 'enterprise'
    creditsBalance: number
    weeklyCap: number
    autoStop: boolean
  }
  jobs: {
    active: number
    queued: number
    failed: number
  }
  delivery: Array<{
    id: string
    name: string
    status: string
    tickets: number
    done: number
    blocked: number
  }>
}

interface DashboardTicket {
  level?: string
  status?: string
  blockedBy?: unknown[]
}

interface DashboardProject {
  id: string
  name: string
  status?: string
  tickets?: DashboardTicket[]
}

const EMPTY_SUMMARY: DashboardSummary = {
  tasks: 0,
  tickets: 0,
  projects: 0,
  assistants: 0,
  quota: {
    tier: 'free',
    creditsBalance: 0,
    weeklyCap: 0,
    autoStop: true,
  },
  jobs: {
    active: 0,
    queued: 0,
    failed: 0,
  },
  delivery: [],
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
          {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
        </div>
        <div className="rounded-lg border border-border/70 bg-background/70 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}

export function ControlCenterDashboard() {
  const [tab, setTab] = useState<'overview' | 'delivery' | 'quality' | 'operations'>('overview')
  const [loading, setLoading] = useState(true)
  const [loadingStage, setLoadingStage] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY)
  const uiPreferences = useSwarmStore((s) => s.uiPreferences)
  const setActiveTab = useSwarmStore((s) => s.setActiveTab)
  const settings = useSwarmStore((s) => s.settings)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setLoadingStage(0)
    setErrorMessage(null)
    try {
      setLoadingStage(1)
      const summaryRes = await fetch('/api/dashboard/summary')
      if (summaryRes.ok) {
        const summaryJson = (await summaryRes.json()) as DashboardSummary
        setSummary({
          ...EMPTY_SUMMARY,
          ...summaryJson,
        })
        setLoadingStage(3)
        return
      }

      // Fallback for environments where dashboard summary endpoint is unavailable.
      setLoadingStage(2)
      const [projectsRes, metricsRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/metrics/dashboard'),
      ])
      const projectsJson = projectsRes.ok ? await projectsRes.json() : { data: [] }
      const metricsJson = metricsRes.ok ? await metricsRes.json() : null
      const projects: DashboardProject[] = Array.isArray(projectsJson?.data)
        ? (projectsJson.data as DashboardProject[])
        : []
      const tickets = projects.flatMap((project): DashboardTicket[] =>
        Array.isArray(project.tickets) ? project.tickets : []
      )

      setSummary({
        ...EMPTY_SUMMARY,
        tasks: tickets.filter((ticket) =>
          ticket.level === 'task' || ticket.level === 'subtask' || ticket.level === 'subatomic'
        ).length,
        tickets: tickets.length,
        projects: projects.length,
        assistants: Array.isArray(metricsJson?.agents?.installed)
          ? metricsJson.agents.installed.filter((agent: { installed?: boolean }) => agent.installed).length
          : 0,
        quota: {
          tier: metricsJson?.subscription?.tier ?? 'free',
          creditsBalance: metricsJson?.subscription?.creditsBalance ?? 0,
          weeklyCap: metricsJson?.subscription?.weeklyCap ?? 0,
          autoStop: metricsJson?.subscription?.autoStop ?? true,
        },
        jobs: {
          active: metricsJson?.jobs?.active ?? 0,
          queued: metricsJson?.jobs?.queued ?? 0,
          failed: metricsJson?.jobs?.failed ?? 0,
        },
        delivery: projects.map((project) => {
          const projectTickets: DashboardTicket[] = Array.isArray(project.tickets) ? project.tickets : []
          return {
            id: project.id,
            name: project.name,
            status: project.status ?? 'planning',
            tickets: projectTickets.length,
            done: projectTickets.filter((ticket) => ticket.status === 'done' || ticket.status === 'approved').length,
            blocked: projectTickets.filter((ticket) => Array.isArray(ticket.blockedBy) && ticket.blockedBy.length > 0).length,
          }
        }),
      })
      setLoadingStage(3)
    } catch (error) {
      setSummary(EMPTY_SUMMARY)
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const quotaLabel = useMemo(() => {
    if (!summary.quota.weeklyCap) return 'No weekly cap configured'
    return `${summary.quota.creditsBalance} / ${summary.quota.weeklyCap} credits`
  }, [summary.quota.creditsBalance, summary.quota.weeklyCap])

  const guided = uiPreferences.experienceLevel === 'guided'

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-card/40 p-5">
          <LoadingState
            variant="workflow"
            size="lg"
            text="Building your control center..."
            steps={['Collect', 'Aggregate', 'Compose', 'Ready']}
            activeStep={loadingStage}
          />
        </div>
      </div>
    )
  }

  if (errorMessage && summary.projects === 0 && summary.tickets === 0 && summary.tasks === 0) {
    return (
      <div className="p-6">
        <ErrorState
          title="Control Center is unavailable"
          description={errorMessage}
          onRetry={() => {
            void loadSummary()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Control Center</h2>
          <p className="text-sm text-muted">
            Unified workspace operations across delivery, quality, and runtime.
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {guided ? 'Guided View' : 'Expert View'}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-border/70 bg-card/40 p-1">
          <TabsTrigger value="overview" className="rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground">Overview</TabsTrigger>
          <TabsTrigger value="delivery" className="rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground">Delivery</TabsTrigger>
          <TabsTrigger value="quality" className="rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground">Quality</TabsTrigger>
          <TabsTrigger value="operations" className="rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-primary/15 data-[state=active]:text-foreground">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard title="Tasks" value={summary.tasks} subtitle="Work items in execution levels" icon={ClipboardList} />
            <KpiCard title="Tickets" value={summary.tickets} subtitle="Total tracked ticket items" icon={Layers} />
            <KpiCard title="Projects" value={summary.projects} subtitle="Active workspace projects" icon={FolderKanban} />
            <KpiCard title="Assistants" value={summary.assistants} subtitle="Installed runtime assistants" icon={Activity} />
            <KpiCard title="Quota" value={quotaLabel} subtitle={`${summary.quota.tier.toUpperCase()} ${summary.quota.autoStop ? '| Auto-stop on' : ''}`} icon={CheckCircle2} />
          </div>

          <section className="rounded-xl border border-border/70 bg-background/40 p-3">
            <p className="mb-3 text-sm font-semibold text-foreground">Run Status</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/80 bg-background/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Active Runs</p>
                <p className="mt-1 text-xl font-semibold">{summary.jobs.active}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Queued Runs</p>
                <p className="mt-1 text-xl font-semibold">{summary.jobs.queued}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-background/60 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-muted">Failed Runs</p>
                <p className="mt-1 text-xl font-semibold">{summary.jobs.failed}</p>
              </div>
            </div>
          </section>

          {summary.projects === 0 && summary.tickets === 0 && summary.tasks === 0 ? (
            <NoDataState
              title="No delivery signal yet"
              description="Start work to create your first project, tickets, and execution runs."
              actionLabel="Open conversations"
              onAction={() => setActiveTab('chat')}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="delivery" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.25fr_1fr]">
            <section className="rounded-xl border border-border/70 bg-background/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Delivery Board</p>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setActiveTab('chat')}>
                  Open conversations <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              {summary.delivery.length === 0 ? (
                <NoDataState
                  title="No delivery projects yet"
                  description="Create a project or promote an idea to begin delivery tracking."
                  className="min-h-[180px]"
                />
              ) : (
                <div className="space-y-2">
                  {summary.delivery.map((project) => (
                    <div key={project.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/70 p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted">
                          {project.done}/{project.tickets} done | {project.blocked} blocked
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          project.status === 'completed' ? 'border-emerald-500/50 text-emerald-500' :
                          project.status === 'in_progress' ? 'border-blue-500/50 text-blue-500' :
                          project.status === 'archived' ? 'border-zinc-500/50 text-zinc-500' :
                          'border-amber-500/50 text-amber-500'
                        )}
                      >
                        {project.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <IdeasWorkspace />
          </div>
        </TabsContent>

        <TabsContent value="quality" className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-background/40 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Quality Control</p>
              <Badge variant="outline">Integrated Testing Surface</Badge>
            </div>
            <div>
              <TestingDashboard />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-background/40 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Operations and Observability</p>
              <Badge variant="outline">Runtime Assistants | Queue | Errors</Badge>
            </div>
            <div>
              <ObservabilityDashboard />
            </div>
          </div>

          {!guided && (
            <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/40 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                <div className="text-xs text-muted">
                  Advanced diagnostics are enabled in Expert view. Adjust refresh and panel density in
                  Settings Personalization section.
                </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {settings.maxConcurrentJobs && (
        <p className="text-xs text-muted">
          Concurrent run limit configured: {settings.maxConcurrentJobs}
        </p>
      )}
    </div>
  )
}
