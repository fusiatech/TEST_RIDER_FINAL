import type { Ticket, Project } from '@/lib/types'

export function generateTicketSummaryPrompt(ticket: Ticket): string {
  const statusMap: Record<string, string> = {
    backlog: 'waiting to be started',
    in_progress: 'currently being worked on',
    review: 'completed and awaiting review',
    approved: 'approved and ready',
    done: 'completed',
    rejected: 'needs changes',
  }

  const complexityMap: Record<string, string> = {
    S: 'a quick task',
    M: 'a moderate task',
    L: 'a significant task',
    XL: 'a major undertaking',
  }

  return `Summarize this ticket in 2-3 plain English sentences for a non-technical user:

Title: ${ticket.title}
Description: ${ticket.description || 'No description provided'}
Status: ${statusMap[ticket.status] || ticket.status}
Size: ${complexityMap[ticket.complexity] || ticket.complexity}
${ticket.acceptanceCriteria.length > 0 ? `Requirements: ${ticket.acceptanceCriteria.join('; ')}` : ''}

Focus on:
- What needs to be done (in simple terms)
- Current progress
- Any key requirements

Keep it simple and avoid technical jargon. Write as if explaining to someone unfamiliar with software development.`
}

export function generateProjectSummaryPrompt(project: Project): string {
  const ticketStats = {
    total: project.tickets.length,
    done: project.tickets.filter((t) => t.status === 'done').length,
    inProgress: project.tickets.filter((t) => t.status === 'in_progress').length,
    review: project.tickets.filter((t) => t.status === 'review').length,
    backlog: project.tickets.filter((t) => t.status === 'backlog').length,
    blocked: project.tickets.filter((t) => t.blockedBy && t.blockedBy.length > 0).length,
  }

  const completionPct =
    ticketStats.total > 0
      ? Math.round((ticketStats.done / ticketStats.total) * 100)
      : 0

  const recentTickets = project.tickets
    .filter((t) => t.status === 'in_progress' || t.status === 'review')
    .slice(0, 3)
    .map((t) => t.title)

  return `Summarize this project's current status in 3-4 plain English sentences:

Project: ${project.name}
Description: ${project.description || 'No description'}
Overall Progress: ${completionPct}% complete (${ticketStats.done} of ${ticketStats.total} tasks done)
Active Tasks: ${ticketStats.inProgress} in progress, ${ticketStats.review} awaiting review
Pending: ${ticketStats.backlog} tasks in backlog
${ticketStats.blocked > 0 ? `Blocked: ${ticketStats.blocked} tasks are blocked` : ''}
${recentTickets.length > 0 ? `Currently working on: ${recentTickets.join(', ')}` : ''}

Focus on:
- Overall progress and health of the project
- What's currently being worked on
- Any concerns or blockers
- Next steps

Keep it simple for non-technical stakeholders. Write as if giving a brief status update to an executive.`
}

export function generateEpicSummaryPrompt(
  epicTitle: string,
  epicDescription: string,
  tickets: Ticket[]
): string {
  const stats = {
    total: tickets.length,
    done: tickets.filter((t) => t.status === 'done').length,
    inProgress: tickets.filter((t) => t.status === 'in_progress').length,
  }

  const completionPct =
    stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

  return `Summarize this epic (feature group) in 2-3 plain English sentences:

Epic: ${epicTitle}
Description: ${epicDescription || 'No description'}
Progress: ${completionPct}% complete (${stats.done} of ${stats.total} tasks)
Active: ${stats.inProgress} tasks in progress

Focus on:
- What this feature/epic is about
- Current progress
- What remains to be done

Keep it simple and non-technical.`
}
