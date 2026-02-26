import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { WSMessageSchema } from '@/lib/types'
import type { WSMessage, AgentStatus as AgentStatusType } from '@/lib/types'
import { cancelSwarm, runSwarmPipeline } from '@/server/orchestrator'
import { getSettings } from '@/server/storage'
import { jobQueue } from '@/server/job-queue'
import { scheduler } from '@/server/scheduler'
import { createLogger } from '@/server/logger'

const logger = createLogger('ws-server')

const HEARTBEAT_INTERVAL = 30000

interface ExtWebSocket extends WebSocket {
  isAlive: boolean
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
        ...(msg.attachments && msg.attachments.length > 0 ? { attachments: msg.attachments } : {}),
      })
      ws.send(JSON.stringify({ type: 'job-status', job }))
      break
    }

    case 'cancel-swarm':
      logger.info('cancel-swarm received', { sessionId: msg.sessionId })
      cancelSwarm()
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

    default:
      break
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
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtWebSocket
    extWs.isAlive = true
    logger.info('Client connected')

    extWs.on('pong', () => {
      extWs.isAlive = true
    })

    extWs.on('message', (data) => {
      handleMessage(extWs, data.toString())
    })

    extWs.on('close', () => {
      logger.info('Client disconnected')
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
