import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { WSMessageSchema } from '@/lib/types'
import type { WSMessage } from '@/lib/types'
import { cancelSwarm } from '@/server/orchestrator'
import { getDb, getEffectiveSettingsForUser, getSettings, getUsers, getUserByEmail, saveUser } from '@/server/storage'
import { jobQueue } from '@/server/job-queue'
import { scheduler } from '@/server/scheduler'
import { createLogger } from '@/server/logger'
import { websocketConnections } from '@/lib/metrics'
import { startFileWatcher, stopFileWatcher } from '@/server/file-watcher'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import { auditEmergencyStop, auditJobCancel, auditJobPause, auditJobResume } from '@/lib/audit'
import { validateToolContractEnvelope } from '@/server/output-schemas'
import {
  authenticateWSConnection,
  canPerformOperation,
  getRequiredRoleForOperation,
  type WSAuthenticatedUser,
} from '@/server/ws-auth'

const logger = createLogger('ws-server')
const WS_PATH = '/api/ws'

const HEARTBEAT_INTERVAL = 30000

// In development we default to unauthenticated WS unless explicitly enabled.
// In production we default to authenticated WS unless explicitly disabled.
const WS_AUTH_ENABLED = process.env.WS_AUTH_ENABLED === 'false' ? false : true
const DEV_PROFILE_FALLBACK_ENABLED =
  process.env.SWARM_ALLOW_DEV_WS_FALLBACK === '1' ||
  process.env.SWARM_ALLOW_DEV_WS_FALLBACK === 'true' ||
  // Backward compatibility for existing local scripts.
  process.env.SWARM_DEV_PROFILE_FALLBACK === '1' ||
  process.env.SWARM_DEV_PROFILE_FALLBACK === 'true'

interface ExtWebSocket extends WebSocket {
  isAlive: boolean
  user?: WSAuthenticatedUser
  authenticated: boolean
  runtimeUserId?: string
}

let wss: WebSocketServer | null = null
let cachedDevFallbackUserId: string | undefined

async function resolveDevFallbackUserId(): Promise<string | null> {
  if (cachedDevFallbackUserId) {
    return cachedDevFallbackUserId
  }

  let users = await getUsers()
  if (users.length === 0) {
    const preferredEmail =
      process.env.SWARM_DEV_FALLBACK_EMAIL?.trim().toLowerCase() || 'local@swarmui.dev'
    const now = Date.now()
    try {
      const existing = await getUserByEmail(preferredEmail)
      if (existing) {
        cachedDevFallbackUserId = existing.id
        return existing.id
      }
      const fallbackUserId = `dev-${now}`
      await saveUser({
        id: fallbackUserId,
        email: preferredEmail,
        name: 'Local Dev',
        role: 'editor',
        createdAt: now,
        updatedAt: now,
      })
      cachedDevFallbackUserId = fallbackUserId
      return fallbackUserId
    } catch {
      // Don't cache null: a user may register after startup.
      return null
    }
  }

  const preferredEmail = process.env.SWARM_DEV_FALLBACK_EMAIL?.trim().toLowerCase()
  if (preferredEmail) {
    const exact = users.find((u) => u.email.toLowerCase() === preferredEmail)
    if (exact) {
      cachedDevFallbackUserId = exact.id
      return exact.id
    }
  }

  // Prefer users that already have profile API keys configured so
  // unauthenticated dev runs use a working provider path immediately.
  const db = await getDb()
  const userApiKeys = db.data.userApiKeys ?? {}
  const usersWithKeys = users.filter((u) => {
    const keys = userApiKeys[u.id]
    return Boolean(keys && Object.values(keys).some((value) => Boolean(value)))
  })
  const keyedNonViewer = usersWithKeys
    .filter((u) => u.role !== 'viewer')
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const keyedPick = keyedNonViewer[0] ?? usersWithKeys[0]
  if (keyedPick) {
    cachedDevFallbackUserId = keyedPick.id
    return keyedPick.id
  }

  const nonViewer = users
    .filter((u) => u.role !== 'viewer')
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const pick = nonViewer[0] ?? users[0]
  cachedDevFallbackUserId = pick?.id
  return pick?.id ?? null
}

async function handleMessage(ws: ExtWebSocket, raw: string): Promise<void> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    ws.send(JSON.stringify({ type: 'swarm-error', error: 'Invalid JSON' }))
    return
  }

  const result = WSMessageSchema.safeParse(parsed)
  if (!result.success) {
    ws.send(
      JSON.stringify({
        type: 'swarm-error',
        error: `Invalid message: ${result.error.message}`,
      })
    )
    return
  }

  const msg = result.data

  if (WS_AUTH_ENABLED && ws.user) {
    if (!canPerformOperation(ws.user, msg.type)) {
      const requiredRole = getRequiredRoleForOperation(msg.type)
      logger.warn('Unauthorized operation attempt', {
        userId: ws.user.id,
        userRole: ws.user.role,
        operation: msg.type,
        requiredRole,
      })
      ws.send(
        JSON.stringify({
          type: 'swarm-error',
          error: `Unauthorized: ${msg.type} requires ${requiredRole} role`,
        })
      )
      return
    }
  }

  switch (msg.type) {
    case 'start-swarm': {
      let effectiveUserId: string | undefined = ws.user?.id
      if (!effectiveUserId && process.env.NODE_ENV !== 'production' && DEV_PROFILE_FALLBACK_ENABLED) {
        const fallbackUserId = await resolveDevFallbackUserId()
        effectiveUserId = fallbackUserId ?? undefined
        if (effectiveUserId) {
          logger.warn('Using dev profile fallback for unauthenticated websocket run', {
            userId: effectiveUserId,
          })
          ws.send(
            JSON.stringify({
              type: 'agent-status',
              agentId: 'system',
              status: 'running',
            }),
          )
        }
      }

      if (!effectiveUserId) {
        ws.send(
          JSON.stringify({
            type: 'swarm-error',
            error: 'Authentication is required for profile-scoped API keys. Sign in and retry.',
          })
        )
        break
      }
      ws.runtimeUserId = effectiveUserId
      const pipelineMode = msg.mode ?? 'chat'
      logger.info('start-swarm received', {
        sessionId: msg.sessionId,
        mode: pipelineMode,
        agentSelectionMode: msg.agentSelectionMode ?? 'auto',
        preferredAgent: msg.preferredAgent,
        traceModeValidation: msg.traceModeValidation ?? false,
        prompt: msg.prompt.slice(0, 50),
      })
      ws.send(
        JSON.stringify({
          type: 'agent-status',
          agentId: 'system',
          status: 'running',
        })
      )

      const job = jobQueue.enqueue({
        userId: effectiveUserId,
        sessionId: msg.sessionId,
        prompt: msg.prompt,
        mode: pipelineMode,
        ...(msg.intent ? { intent: msg.intent } : {}),
        ...(msg.agentSelectionMode ? { agentSelectionMode: msg.agentSelectionMode } : {}),
        ...(msg.preferredAgent ? { preferredAgent: msg.preferredAgent } : {}),
        ...(msg.selectedModelId ? { selectedModelId: msg.selectedModelId } : {}),
        ...(msg.reasoningMode ? { reasoningMode: msg.reasoningMode } : {}),
        ...(msg.traceModeValidation !== undefined
          ? { traceModeValidation: msg.traceModeValidation }
          : {}),
        idempotencyKey: msg.idempotencyKey,
        priority: msg.priority,
        ...(msg.attachments && msg.attachments.length > 0 ? { attachments: msg.attachments } : {}),
      })
      ws.send(
        JSON.stringify({
          type: 'run.accepted',
          runId: job.id,
          sessionId: msg.sessionId,
          idempotencyKey: msg.idempotencyKey,
          queuedAt: Date.now(),
        })
      )
      ws.send(JSON.stringify({ type: 'job-status', job }))
      break
    }

    case 'cancel-swarm':
      logger.info('cancel-swarm received', { sessionId: msg.sessionId })
      cancelSwarm()
      break

    case 'cancel-job':
      logger.info('cancel-job received', { jobId: msg.jobId })
      void jobQueue.cancelJob(msg.jobId, ws.user?.id ?? ws.runtimeUserId).then((cancelled) => {
        if (cancelled) {
          void auditJobCancel(msg.jobId)
          ws.send(JSON.stringify({ type: 'agent-status', agentId: 'system', status: 'cancelled' }))
        } else {
          ws.send(JSON.stringify({ type: 'swarm-error', error: 'Job not found or not owned by current user' }))
        }
      })
      break

    case 'pause-job':
      logger.info('pause-job received', { jobId: msg.jobId })
      void jobQueue.pauseJob(msg.jobId, 'ws-pause', ws.user?.id ?? ws.runtimeUserId).then((paused) => {
        if (paused) {
          void auditJobPause(msg.jobId, 'ws-pause')
          ws.send(JSON.stringify({ type: 'run.paused', runId: msg.jobId, reason: 'ws-pause' }))
        } else {
          ws.send(JSON.stringify({ type: 'swarm-error', error: 'Job cannot be paused in current state' }))
        }
      })
      break

    case 'resume-job':
      logger.info('resume-job received', { jobId: msg.jobId })
      void jobQueue.resumeJob(msg.jobId, ws.user?.id ?? ws.runtimeUserId).then((resumed) => {
        if (resumed) {
          void auditJobResume(msg.jobId)
          ws.send(JSON.stringify({ type: 'run.resumed', runId: msg.jobId }))
        } else {
          ws.send(JSON.stringify({ type: 'swarm-error', error: 'Job cannot be resumed in current state' }))
        }
      })
      break

    case 'cancel-all-queued':
      logger.info('cancel-all-queued received')
      void jobQueue.cancelAllQueued(ws.user?.id ?? ws.runtimeUserId).then((count) => {
        ws.send(JSON.stringify({ type: 'agent-status', agentId: 'system', status: 'completed' }))
        logger.info('Cancelled queued jobs', { count })
      })
      break

    case 'emergency-stop':
      logger.warn('emergency-stop received', { reason: msg.reason })
      void jobQueue.emergencyStop(msg.reason ?? 'ws-emergency-stop', ws.user?.id ?? ws.runtimeUserId).then((result) => {
        void auditEmergencyStop(msg.reason)
        ws.send(
          JSON.stringify({
            type: 'run.emergency_stopped',
            reason: msg.reason ?? 'ws-emergency-stop',
            cancelledQueued: result.cancelledQueued,
            cancelledRunning: result.cancelledRunning,
          })
        )
      })
      break

    case 'confirm-response':
      logger.info('confirm-response received', { requestId: msg.requestId, approved: msg.approved })
      break

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))
      break

    case 'ticket-created':
    case 'ticket-updated':
    case 'tickets-list':
      break

    case 'mcp-tool-call': {
      const { call } = msg
      const contract = validateToolContractEnvelope(call)
      if (!contract.isValid || !contract.parsed) {
        ws.send(
          JSON.stringify({
            type: 'swarm-error',
            error: `Invalid MCP tool call contract: ${contract.errors.join('; ')}`,
          })
        )
        break
      }
      logger.info('mcp-tool-call received', { serverId: call.serverId, toolName: call.toolName })
      void handleMCPToolCall(ws, contract.parsed)
      break
    }

    case 'watch-project': {
      const { projectPath } = msg
      logger.info('watch-project received', { projectPath })
      const resolved = resolvePathWithinWorkspace(projectPath)
      if (!resolved.ok || !resolved.path) {
        ws.send(
          JSON.stringify({
            type: 'swarm-error',
            error: resolved.error ?? 'Path outside workspace root',
          })
        )
        return
      }

      try {
        startFileWatcher(resolved.path, (info) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'file-changed',
                event: info.event,
                path: info.path,
              })
            )
          }
        })
        ws.send(JSON.stringify({ type: 'agent-status', agentId: 'file-watcher', status: 'running' }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Failed to start file watcher', { error: message })
        ws.send(JSON.stringify({ type: 'swarm-error', error: `Failed to start file watcher: ${message}` }))
      }
      break
    }

    case 'unwatch-project': {
      logger.info('unwatch-project received')
      stopFileWatcher()
      ws.send(JSON.stringify({ type: 'agent-status', agentId: 'file-watcher', status: 'completed' }))
      break
    }

    default:
      break
  }
}

async function handleMCPToolCall(
  ws: ExtWebSocket,
  call: { serverId: string; toolName: string; args: Record<string, unknown> }
): Promise<void> {
  try {
    const { connectMCPServer, callMCPTool } = await import('@/server/mcp-client')
    const settings = ws.user?.id
      ? await getEffectiveSettingsForUser(ws.user.id)
      : await getSettings()
    const mcpServers = settings.mcpServers ?? []
    const serverConfig = mcpServers.find((s) => s.id === call.serverId)

    if (!serverConfig) {
      ws.send(JSON.stringify({
        type: 'mcp-tool-error',
        serverId: call.serverId,
        toolName: call.toolName,
        error: `Server ${call.serverId} not found`,
      }))
      return
    }

    if (!serverConfig.enabled) {
      ws.send(JSON.stringify({
        type: 'mcp-tool-error',
        serverId: call.serverId,
        toolName: call.toolName,
        error: `Server ${call.serverId} is disabled`,
      }))
      return
    }

    const config = {
      id: serverConfig.id,
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
    }

    const connection = await connectMCPServer(config)
    const result = await callMCPTool(connection, call.toolName, call.args)

    ws.send(JSON.stringify({
      type: 'mcp-tool-result',
      result: {
        serverId: call.serverId,
        toolName: call.toolName,
        result,
        timestamp: Date.now(),
      },
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('MCP tool call failed', { error: message, serverId: call.serverId, toolName: call.toolName })
    ws.send(JSON.stringify({
      type: 'mcp-tool-error',
      serverId: call.serverId,
      toolName: call.toolName,
      error: message,
    }))
  }
}

export function broadcastToAll(msg: WSMessage): void {
  if (!wss) return
  const data = JSON.stringify(msg)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

function socketUserId(ws: ExtWebSocket): string | undefined {
  return ws.user?.id ?? ws.runtimeUserId
}

export function broadcastToUser(userId: string | undefined, msg: WSMessage): void {
  if (!wss || !userId) return
  const data = JSON.stringify(msg)
  wss.clients.forEach((client) => {
    const ext = client as ExtWebSocket
    if (client.readyState !== WebSocket.OPEN) return
    if (socketUserId(ext) !== userId) return
    client.send(data)
  })
}

export function startWSServer(server: http.Server): WebSocketServer {
  wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 5 * 1024 * 1024,
  })

  server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname

    // Only handle Swarm UI websocket upgrades on the dedicated endpoint.
    // This avoids collisions with Next.js dev/HMR and other websocket handlers.
    if (pathname !== WS_PATH) {
      return
    }

    if (WS_AUTH_ENABLED) {
      const authResult = await authenticateWSConnection(request)

      if (!authResult.authenticated) {
        if (process.env.NODE_ENV !== 'production') {
          logger.warn('WebSocket auth failed in development; allowing unauthenticated connection with fallback profile', {
            error: authResult.error,
            ip: request.socket.remoteAddress,
          })
          wss!.handleUpgrade(request, socket, head, (ws) => {
            const extWs = ws as ExtWebSocket
            extWs.authenticated = false
            wss!.emit('connection', extWs, request)
          })
          return
        }

        logger.warn('WebSocket connection rejected - authentication failed', {
          error: authResult.error,
          ip: request.socket.remoteAddress,
        })
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      wss!.handleUpgrade(request, socket, head, (ws) => {
        const extWs = ws as ExtWebSocket
        extWs.user = authResult.user
        extWs.authenticated = true
        wss!.emit('connection', extWs, request)
      })
    } else {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        const extWs = ws as ExtWebSocket
        extWs.authenticated = false
        wss!.emit('connection', extWs, request)
      })
    }
  })

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtWebSocket
    extWs.isAlive = true
    websocketConnections.inc()

    if (WS_AUTH_ENABLED && extWs.user) {
      logger.info('Client connected', {
        userId: extWs.user.id,
        email: extWs.user.email,
        role: extWs.user.role,
      })
    } else {
      logger.info('Client connected (unauthenticated mode)')
    }

    extWs.on('pong', () => {
      extWs.isAlive = true
    })

    extWs.on('message', (data) => {
      void handleMessage(extWs, data.toString())
    })

    extWs.on('close', (code: number, reasonBuffer: Buffer) => {
      websocketConnections.dec()
      const reason = reasonBuffer.toString('utf8')
      if (WS_AUTH_ENABLED && extWs.user) {
        logger.info('Client disconnected', {
          userId: extWs.user.id,
          code,
          ...(reason ? { reason } : {}),
        })
      } else {
        logger.info('Client disconnected', {
          code,
          ...(reason ? { reason } : {}),
        })
      }
    })

    extWs.on('error', (err) => {
      logger.error('WebSocket error', { error: err.message })
    })
  })

  const heartbeat = setInterval(() => {
    if (!wss) {
      clearInterval(heartbeat)
      return
    }
    wss.clients.forEach((ws) => {
      const extWs = ws as ExtWebSocket
      if (!extWs.isAlive) {
        logger.warn('Terminating stale connection')
        extWs.terminate()
        return
      }
      extWs.isAlive = false
      extWs.ping()
    })
  }, HEARTBEAT_INTERVAL)

  wss.on('close', () => {
    clearInterval(heartbeat)
  })

  wss.on('error', (err) => {
    logger.error('WebSocket server error', { error: err.message })
  })

  logger.info('WebSocket server attached to HTTP server')
  logger.info('WebSocket endpoint', { path: WS_PATH })

  void scheduler.init().then(() => {
    scheduler.start()
    logger.info('Scheduler initialized and started')
  })

  return wss
}
