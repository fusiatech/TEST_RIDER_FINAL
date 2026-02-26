import { WebSocketServer, WebSocket } from 'ws'
import { WSMessageSchema } from '@/lib/types'
import type { WSMessage, AgentStatus as AgentStatusType } from '@/lib/types'
import { runSwarmPipeline, cancelSwarm } from '@/server/orchestrator'
import { getSettings } from '@/server/storage'

const HEARTBEAT_INTERVAL = 30000

interface ExtWebSocket extends WebSocket {
  isAlive: boolean
}

let wss: WebSocketServer | null = null
let started = false

function broadcastToAll(msg: WSMessage): void {
  if (!wss) return
  const data = JSON.stringify(msg)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

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
      const pipelineMode = msg.mode
      console.log(`[WS] start-swarm sessionId=${msg.sessionId}, mode=${pipelineMode ?? 'auto'}, prompt="${msg.prompt.slice(0, 50)}..."`)
      ws.send(
        JSON.stringify({
          type: 'agent-status',
          agentId: 'system',
          status: 'running',
        })
      )

      getSettings()
        .then((settings) =>
          runSwarmPipeline({
            prompt: msg.prompt,
            settings,
            projectPath: settings.projectPath ?? process.cwd(),
            mode: pipelineMode,
            onAgentOutput: (agentId: string, data: string) => {
              broadcastToAll({ type: 'agent-output', agentId, data })
            },
            onAgentStatus: (agentId: string, status: string, exitCode?: number) => {
              broadcastToAll({
                type: 'agent-status',
                agentId,
                status: status as AgentStatusType,
                exitCode,
              })
            },
          })
        )
        .then((pipelineResult) => {
          broadcastToAll({ type: 'swarm-result', result: pipelineResult })
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          broadcastToAll({ type: 'swarm-error', error: message })
        })
      break
    }

    case 'cancel-swarm':
      console.log(`[WS] cancel-swarm sessionId=${msg.sessionId}`)
      cancelSwarm()
      break

    case 'confirm-response':
      console.log(`[WS] confirm-response requestId=${msg.requestId}, approved=${msg.approved}`)
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

export function startStandaloneWSServer(): void {
  if (started) return
  started = true

  const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10)
  wss = new WebSocketServer({ port: WS_PORT })

  wss.on('connection', (ws: WebSocket) => {
    const extWs = ws as ExtWebSocket
    extWs.isAlive = true
    console.log('[WS] Client connected')

    extWs.on('pong', () => {
      extWs.isAlive = true
    })

    extWs.on('message', (data) => {
      handleMessage(extWs, data.toString())
    })

    extWs.on('close', () => {
      console.log('[WS] Client disconnected')
    })

    extWs.on('error', (err) => {
      console.error('[WS] Error:', err.message)
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
        console.log('[WS] Terminating stale connection')
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

  console.log(`[WS] Standalone WebSocket server on port ${WS_PORT}`)
}
