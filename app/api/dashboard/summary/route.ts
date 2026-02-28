import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getJobs, getProjects, getSettings } from '@/server/storage'
import { detectInstalledCLIs } from '@/server/cli-detect'

interface SummaryResponse {
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

export async function GET(): Promise<NextResponse<SummaryResponse | { error: string }>> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [projects, jobs, settings, detectedCLIs] = await Promise.all([
    getProjects(),
    getJobs(),
    getSettings(),
    detectInstalledCLIs(),
  ])

  const tickets = projects.flatMap((project) => project.tickets ?? [])
  const tasks = tickets.filter((ticket) =>
    ticket.level === 'task' || ticket.level === 'subtask' || ticket.level === 'subatomic'
  ).length

  const enabledProviders = new Set(settings.enabledCLIs ?? [])
  const assistants = detectedCLIs.filter((cli) => cli.installed && enabledProviders.has(cli.id)).length

  const activeStatuses = new Set(['running', 'active'])
  const queuedStatuses = new Set(['queued', 'pending'])
  const failedStatuses = new Set(['failed', 'error'])

  const summary: SummaryResponse = {
    tasks,
    tickets: tickets.length,
    projects: projects.length,
    assistants,
    quota: {
      tier: settings.subscriptionTier ?? 'free',
      creditsBalance: settings.credits?.balance ?? 0,
      weeklyCap: settings.credits?.weeklyCap ?? 0,
      autoStop: settings.credits?.autoStop ?? true,
    },
    jobs: {
      active: jobs.filter((job) => activeStatuses.has(job.status)).length,
      queued: jobs.filter((job) => queuedStatuses.has(job.status)).length,
      failed: jobs.filter((job) => failedStatuses.has(job.status)).length,
    },
    delivery: projects.map((project) => {
      const projectTickets = project.tickets ?? []
      return {
        id: project.id,
        name: project.name,
        status: project.status ?? 'planning',
        tickets: projectTickets.length,
        done: projectTickets.filter((ticket) => ticket.status === 'done' || ticket.status === 'approved').length,
        blocked: projectTickets.filter((ticket) => (ticket.blockedBy?.length ?? 0) > 0).length,
      }
    }),
  }

  return NextResponse.json(summary)
}

