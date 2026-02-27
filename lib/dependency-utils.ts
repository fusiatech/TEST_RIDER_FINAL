import type { Ticket } from './types'

export interface DependencyNode {
  id: string
  ticket: Ticket
  dependencies: string[]
  blockedBy: string[]
  depth: number
  isBlocked: boolean
  isOnCriticalPath: boolean
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>
  roots: string[]
  leaves: string[]
  criticalPath: string[]
  hasCircularDependency: boolean
  circularChain: string[]
}

export function detectCircularDependency(
  tickets: Ticket[],
  startId: string,
  newDependencyId: string
): { hasCircle: boolean; chain: string[] } {
  const ticketMap = new Map(tickets.map((t) => [t.id, t]))

  const visited = new Set<string>()
  const chain: string[] = []

  function dfs(currentId: string): boolean {
    if (currentId === startId) {
      chain.push(currentId)
      return true
    }

    if (visited.has(currentId)) {
      return false
    }

    visited.add(currentId)
    chain.push(currentId)

    const ticket = ticketMap.get(currentId)
    if (!ticket) {
      chain.pop()
      return false
    }

    for (const depId of ticket.dependencies) {
      if (dfs(depId)) {
        return true
      }
    }

    chain.pop()
    return false
  }

  if (dfs(newDependencyId)) {
    return { hasCircle: true, chain: [...chain].reverse() }
  }

  return { hasCircle: false, chain: [] }
}

export function buildDependencyGraph(tickets: Ticket[]): DependencyGraph {
  const nodes = new Map<string, DependencyNode>()
  const ticketMap = new Map(tickets.map((t) => [t.id, t]))

  for (const ticket of tickets) {
    const blockedBy = ticket.blockedBy || []
    const isBlocked = blockedBy.some((depId) => {
      const dep = ticketMap.get(depId)
      return dep && dep.status !== 'done' && dep.status !== 'approved'
    })

    nodes.set(ticket.id, {
      id: ticket.id,
      ticket,
      dependencies: ticket.dependencies,
      blockedBy,
      depth: 0,
      isBlocked,
      isOnCriticalPath: false,
    })
  }

  const roots: string[] = []
  const leaves: string[] = []

  for (const [id, node] of nodes) {
    const hasIncoming = tickets.some((t) => t.dependencies.includes(id))
    const hasOutgoing = node.dependencies.length > 0

    if (!hasOutgoing) {
      roots.push(id)
    }
    if (!hasIncoming) {
      leaves.push(id)
    }
  }

  function calculateDepth(nodeId: string, visited: Set<string>): number {
    if (visited.has(nodeId)) return 0

    const node = nodes.get(nodeId)
    if (!node) return 0

    visited.add(nodeId)

    if (node.dependencies.length === 0) {
      node.depth = 0
      return 0
    }

    let maxDepth = 0
    for (const depId of node.dependencies) {
      const depDepth = calculateDepth(depId, visited)
      maxDepth = Math.max(maxDepth, depDepth + 1)
    }

    node.depth = maxDepth
    return maxDepth
  }

  for (const leafId of leaves) {
    calculateDepth(leafId, new Set())
  }

  let hasCircularDependency = false
  let circularChain: string[] = []

  function detectCycle(startId: string): boolean {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const path: string[] = []

    function dfs(nodeId: string): boolean {
      visited.add(nodeId)
      recursionStack.add(nodeId)
      path.push(nodeId)

      const node = nodes.get(nodeId)
      if (!node) {
        path.pop()
        recursionStack.delete(nodeId)
        return false
      }

      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true
        } else if (recursionStack.has(depId)) {
          const cycleStart = path.indexOf(depId)
          circularChain = path.slice(cycleStart)
          circularChain.push(depId)
          return true
        }
      }

      path.pop()
      recursionStack.delete(nodeId)
      return false
    }

    return dfs(startId)
  }

  for (const ticket of tickets) {
    if (detectCycle(ticket.id)) {
      hasCircularDependency = true
      break
    }
  }

  const criticalPath = findCriticalPath(nodes, roots, leaves)

  for (const nodeId of criticalPath) {
    const node = nodes.get(nodeId)
    if (node) {
      node.isOnCriticalPath = true
    }
  }

  return {
    nodes,
    roots,
    leaves,
    criticalPath,
    hasCircularDependency,
    circularChain,
  }
}

function findCriticalPath(
  nodes: Map<string, DependencyNode>,
  roots: string[],
  leaves: string[]
): string[] {
  if (nodes.size === 0) return []

  let maxDepth = 0
  let deepestLeaf = ''

  for (const leafId of leaves) {
    const node = nodes.get(leafId)
    if (node && node.depth >= maxDepth) {
      maxDepth = node.depth
      deepestLeaf = leafId
    }
  }

  if (!deepestLeaf && leaves.length > 0) {
    deepestLeaf = leaves[0]
  }

  if (!deepestLeaf) return []

  const path: string[] = []
  let currentId: string | null = deepestLeaf

  while (currentId) {
    path.push(currentId)
    const node = nodes.get(currentId)
    if (!node || node.dependencies.length === 0) break

    let nextId: string | null = null
    let maxNextDepth = -1

    for (const depId of node.dependencies) {
      const depNode = nodes.get(depId)
      if (depNode && depNode.depth > maxNextDepth) {
        maxNextDepth = depNode.depth
        nextId = depId
      }
    }

    currentId = nextId
  }

  return path.reverse()
}

export function getBlockedTickets(tickets: Ticket[]): Ticket[] {
  const ticketMap = new Map(tickets.map((t) => [t.id, t]))

  return tickets.filter((ticket) => {
    const blockedBy = ticket.blockedBy || []
    return blockedBy.some((depId) => {
      const dep = ticketMap.get(depId)
      return dep && dep.status !== 'done' && dep.status !== 'approved'
    })
  })
}

export function getReadyTickets(tickets: Ticket[]): Ticket[] {
  const ticketMap = new Map(tickets.map((t) => [t.id, t]))

  return tickets.filter((ticket) => {
    if (ticket.status === 'done' || ticket.status === 'approved') return false

    const blockedBy = ticket.blockedBy || []
    if (blockedBy.length === 0) return true

    return blockedBy.every((depId) => {
      const dep = ticketMap.get(depId)
      return !dep || dep.status === 'done' || dep.status === 'approved'
    })
  })
}

export function validateDependencyAddition(
  tickets: Ticket[],
  ticketId: string,
  newDependencyId: string
): { valid: boolean; error?: string } {
  if (ticketId === newDependencyId) {
    return { valid: false, error: 'A ticket cannot depend on itself' }
  }

  const ticket = tickets.find((t) => t.id === ticketId)
  if (!ticket) {
    return { valid: false, error: 'Ticket not found' }
  }

  if (ticket.dependencies.includes(newDependencyId)) {
    return { valid: false, error: 'This dependency already exists' }
  }

  const circularCheck = detectCircularDependency(tickets, ticketId, newDependencyId)
  if (circularCheck.hasCircle) {
    const ticketMap = new Map(tickets.map((t) => [t.id, t]))
    const chainNames = circularCheck.chain.map((id) => ticketMap.get(id)?.title || id)
    return {
      valid: false,
      error: `Adding this dependency would create a circular reference: ${chainNames.join(' → ')}`,
    }
  }

  return { valid: true }
}

export function updateBlockedStatus(tickets: Ticket[]): Ticket[] {
  const ticketMap = new Map(tickets.map((t) => [t.id, t]))

  return tickets.map((ticket) => {
    const blockedBy = ticket.blockedBy || []
    const isBlocked = blockedBy.some((depId) => {
      const dep = ticketMap.get(depId)
      return dep && dep.status !== 'done' && dep.status !== 'approved'
    })

    const newBlockedBy = blockedBy.filter((depId) => {
      const dep = ticketMap.get(depId)
      return dep && dep.status !== 'done' && dep.status !== 'approved'
    })

    return {
      ...ticket,
      blockedBy: newBlockedBy,
    }
  })
}

export function isTicketBlocked(ticket: Ticket, allTickets: Ticket[]): boolean {
  const ticketMap = new Map(allTickets.map((t) => [t.id, t]))
  const blockedBy = ticket.blockedBy || []

  return blockedBy.some((depId) => {
    const dep = ticketMap.get(depId)
    return dep && dep.status !== 'done' && dep.status !== 'approved'
  })
}
