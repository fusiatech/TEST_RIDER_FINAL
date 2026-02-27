import type { Ticket } from '@/lib/types'

const COMPLEXITY_MINUTES: Record<string, number> = {
  S: 30,
  M: 120,
  L: 360,
  XL: 720,
}

export type SLARiskLevel = 'none' | 'healthy' | 'at_risk' | 'breached'

export function getTicketDurationMinutes(ticket: Ticket): number {
  return ticket.sla?.targetMinutes ?? COMPLEXITY_MINUTES[ticket.complexity] ?? 120
}

export function getTicketSLARisk(ticket: Ticket, now = Date.now()): SLARiskLevel {
  if (!ticket.sla) return 'none'
  if (ticket.status === 'done' || ticket.status === 'approved') return 'healthy'

  const baseline = ticket.sla.startedAt ?? ticket.createdAt
  const deadline = ticket.sla.breachAt ?? baseline + ticket.sla.targetMinutes * 60_000
  const elapsed = now - baseline
  const thresholdMs = (ticket.sla.warningThresholdPct / 100) * ticket.sla.targetMinutes * 60_000

  if (now >= deadline) return 'breached'
  if (elapsed >= thresholdMs) return 'at_risk'
  return 'healthy'
}

export function getMissingApprovalGates(ticket: Ticket): string[] {
  const required = (ticket.approvals?.requiredGates ?? ['review']) as string[]
  const approved = new Set<string>((ticket.approvals?.approvedGates ?? []) as string[])
  return required.filter((gate) => !approved.has(gate))
}

export function canTicketExecute(ticket: Ticket): boolean {
  return getMissingApprovalGates(ticket).length === 0
}

export function computeCriticalPath(tickets: Ticket[]): { path: string[]; totalDurationMinutes: number } {
  const byId = new Map(tickets.map((t) => [t.id, t]))
  const memo = new Map<string, { path: string[]; duration: number }>()

  const dfs = (id: string, visiting: Set<string>): { path: string[]; duration: number } => {
    if (memo.has(id)) return memo.get(id)!
    if (visiting.has(id)) return { path: [id], duration: 0 }

    const ticket = byId.get(id)
    if (!ticket) return { path: [], duration: 0 }

    visiting.add(id)
    let best: { path: string[]; duration: number } = { path: [id], duration: getTicketDurationMinutes(ticket) }

    const dependents = tickets.filter((t) => t.dependencies.includes(id))
    for (const dependent of dependents) {
      const sub = dfs(dependent.id, visiting)
      const candidate = {
        path: [id, ...sub.path],
        duration: getTicketDurationMinutes(ticket) + sub.duration,
      }
      if (candidate.duration > best.duration) best = candidate
    }

    visiting.delete(id)
    memo.set(id, best)
    return best
  }

  const roots = tickets.filter((t) => t.dependencies.length === 0)
  if (roots.length === 0 && tickets.length > 0) {
    const fallback = dfs(tickets[0].id, new Set<string>())
    return { path: fallback.path, totalDurationMinutes: fallback.duration }
  }

  let globalBest: { path: string[]; duration: number } = { path: [], duration: 0 }
  for (const root of roots) {
    const candidate = dfs(root.id, new Set<string>())
    if (candidate.duration > globalBest.duration) globalBest = candidate
  }

  return { path: globalBest.path, totalDurationMinutes: globalBest.duration }
}
