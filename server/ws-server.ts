import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { WSMessageSchema } from '@/lib/types'
import type { WSMessage } from '@/lib/types'
import { cancelSwarm } from '@/server/orchestrator'
import { getSettings } from '@/server/storage'
import { jobQueue } from '@/server/job-queue'
import { scheduler } from '@/server/scheduler'
import { createLogger } from '@/server/logger'
import { websocketConnections } from '@/lib/metrics'
import { startFileWatcher, stopFileWatcher } from '@/server/file-watcher'
import { resolvePathWithinWorkspace } from '@/server/workspace-path'
import {
  authenticateWSConnection,
  canPerformOperation,
  getRequiredRoleForOperation,
  type WSAuthenticatedUser,
} from '@/server/ws-auth'

const logger = createLogger('ws-server')

const HEARTBEAT_INTERVAL = 30000

const WS_AUTH_ENABLED = process.env.WS_AUTH_ENABLED !== 'false'

interface ExtWebSocket extends WebSocket {
  isAlive: boolean
  user?: WSAuthenticatedUser
  authenticated: boolean
}

let wss: WebSocketServer | null = null

function handleMessage(ws: ExtWebSocket, raw: string): void {
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
      const pipelineMode = msg.mode ?? 'chat'
      logger.info('start-swarm received', { sessionId: msg.sessionId, mode: pipelineMode, prompt: msg.prompt.slice(0, 50) })
      ws.send(
        JSON.stringify({
          type: 'agent-status',
          agentId: 'system',
          status: 'running',
        })
      )

      const job = jobQueue.enqueue({
        sessionId: msg.sessionId,
        prompt: msg.prompt,
        mode: pipelineMode,
        idempotencyKey: msg.idempotencyKey,
        priority: msg.priority,
        ...(msg.attachments && msg.attachments.length > 0 ? { attachments: msg.attachments } : {}),
      })
      ws.send(JSON.stringify({ type: 'job-status', job }))
      break
    }

    case 'cancel-swarm':
      logger.info('cancel-swarm received', { sessionId: msg.sessionId })
      cancelSwarm()
      break

    case 'cancel-job':
      logger.info('cancel-job received', { jobId: msg.jobId })
      void jobQueue.cancelJob(msg.jobId).then((cancelled) => {
        if (cancelled) {
          ws.send(JSON.stringify({ type: 'agent-status', agentId: 'system', status: 'cancelled' }))
        }
      })
      break

    case 'cancel-all-queued':
      logger.info('cancel-all-queued received')
      void jobQueue.cancelAllQueued().then((count) => {
        ws.send(JSON.stringify({ type: 'agent-status', agentId: 'system', status: 'completed' }))
        logger.info('Cancelled queued jobs', { count })
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
      logger.info('mcp-tool-call received', { serverId: call.serverId, toolName: call.toolName })
      void handleMCPToolCall(ws, call)
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
          broadcastToAll({
            type: 'file-changed',
            event: info.event,
            path: info.path,
          })
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
    const settings = await getSettings()
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

export function startWSServer(server: http.Server): WebSocketServer {
  wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname

    if (pathname === '/api/lsp/ws') {
      return
    }

    if (WS_AUTH_ENABLED) {
      const authResult = await authenticateWSConnection(request)

      if (!authResult.authenticated) {
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
      handleMessage(extWs, data.toString())
    })

    extWs.on('close', () => {
      websocketConnections.dec()
      if (WS_AUTH_ENABLED && extWs.user) {
        logger.info('Client disconnected', { userId: extWs.user.id })
      } else {
        logger.info('Client disconnected')
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

  logger.info('WebSocket server attached to HTTP server')

  void scheduler.init().then(() => {
    scheduler.start()
    logger.info('Scheduler initialized and started')
  })

  return wss
}
