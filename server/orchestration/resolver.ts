import type { JobType, Settings } from '@/lib/types'
import type { RoutingDecision } from '@/server/orchestration/types'

function normalizeJobType(jobType: JobType | undefined, source: 'scheduler' | 'user'): JobType {
  if (jobType) return jobType
  return source === 'scheduler' ? 'scheduled-generic' : 'interactive'
}

export function resolveOrchestratorForJob(params: {
  source: 'scheduler' | 'user'
  settings: Settings
  jobType?: JobType
}): RoutingDecision {
  const resolvedJobType = normalizeJobType(params.jobType, params.source)
  const routing = params.settings.jobRouting

  if (resolvedJobType === 'interactive') {
    const resolved = routing?.interactive ?? 'agentic'
    return {
      jobType: resolvedJobType,
      resolvedOrchestrator: resolved,
      reason: `Interactive job routed by settings.jobRouting.interactive=${resolved}`,
    }
  }

  const scheduledDefaults = routing?.scheduled ?? {
    generic: 'deterministic',
    ci: 'deterministic',
    report: 'deterministic',
    deploy: 'deterministic',
  }

  if (resolvedJobType === 'scheduled-ci') {
    return {
      jobType: resolvedJobType,
      resolvedOrchestrator: scheduledDefaults.ci,
      reason: `Scheduled CI job routed by settings.jobRouting.scheduled.ci=${scheduledDefaults.ci}`,
    }
  }
  if (resolvedJobType === 'scheduled-report') {
    return {
      jobType: resolvedJobType,
      resolvedOrchestrator: scheduledDefaults.report,
      reason: `Scheduled report job routed by settings.jobRouting.scheduled.report=${scheduledDefaults.report}`,
    }
  }
  if (resolvedJobType === 'scheduled-deploy') {
    return {
      jobType: resolvedJobType,
      resolvedOrchestrator: scheduledDefaults.deploy,
      reason: `Scheduled deploy job routed by settings.jobRouting.scheduled.deploy=${scheduledDefaults.deploy}`,
    }
  }

  return {
    jobType: resolvedJobType,
    resolvedOrchestrator: scheduledDefaults.generic,
    reason: `Scheduled generic job routed by settings.jobRouting.scheduled.generic=${scheduledDefaults.generic}`,
  }
}
