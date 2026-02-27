import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WebSocket as WSType, WebSocketServer as WSSType } from 'ws'
import type http from 'node:http'
import { EventEmitter } from 'node:events'

const mockJobQueue = {
  enqueue: vi.fn().mockReturnValue({
    id: 'job-123',
    status: 'queued',
    sessionId: 'session-1',
    prompt: 'test prompt',
    createdAt: Date.now(),
  }),
  cancelJob: vi.fn().mockResolvedValue(true),
  cancelAllQueued: vi.fn().mockResolvedValue(3),
}

const mockScheduler = {
  init: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
}

vi.mock('@/server/orchestrator', () => ({
  cancelSwarm: vi.fn(),
}))

vi.mock('@/server/storage', () => ({
  getSettings: vi.fn().mockResolvedValue({
    mcpServers: [],
  }),
}))

vi.mock('@/server/job-queue', () => ({
  jobQueue: mockJobQueue,
}))

vi.mock('@/server/scheduler', () => ({
  scheduler: mockScheduler,
}))

vi.mock('@/server/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/lib/metrics', () => ({
  websocketConnections: {
    inc: vi.fn(),
    dec: vi.fn(),
  },
}))

vi.mock('@/server/file-watcher', () => ({
  startFileWatcher: vi.fn(),
  stopFileWatcher: vi.fn(),
}))

vi.mock('@/server/workspace-path', () => ({
  resolvePathWithinWorkspace: vi.fn().mockReturnValue({ ok: true, path: '/resolved/path' }),
}))

vi.mock('@/server/ws-auth', () => ({
  authenticateWSConnection: vi.fn().mockResolvedValue({
    authenticated: true,
    user: { id: 'user-1', email: 'test@example.com', role: 'editor' },
  }),
  canPerformOperation: vi.fn().mockReturnValue(true),
  getRequiredRoleForOperation: vi.fn().mockReturnValue('editor'),
}))

vi.mock('@/server/mcp-client', () => ({
  connectMCPServer: vi.fn().mockResolvedValue({}),
  callMCPTool: vi.fn().mockResolvedValue({ success: true }),
}))

class MockWebSocket extends EventEmitter {
  readyState = 1 // WebSocket.OPEN
  isAlive = true
  authenticated = false
  user?: { id: string; email: string; role: string }
  sentMessages: string[] = []

  send(data: string) {
    this.sentMessages.push(data)
  }

  ping() {}
  terminate() {}
  close() {}
}

class MockWebSocketServer extends EventEmitter {
  clients: Set<MockWebSocket> = new Set()

  handleUpgrade(
    _request: unknown,
    _socket: unknown,
    _head: unknown,
    callback: (ws: MockWebSocket) => void
  ) {
    const ws = new MockWebSocket()
    this.clients.add(ws)
    callback(ws)
  }
}

vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => new MockWebSocketServer()),
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
}))

describe('ws-server.ts', () => {
  let mockWss: MockWebSocketServer
  let mockWs: MockWebSocket

  beforeEach(() => {
    vi.clearAllMocks()
    mockWss = new MockWebSocketServer()
    mockWs = new MockWebSocket()
    mockWss.clients.add(mockWs)
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('handleMessage', () => {
    describe('JSON parsing', () => {
      it('sends error for invalid JSON', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startWSServer, broadcastToAll } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        ws.emit('message', Buffer.from('not valid json'))
        
        expect(ws.sentMessages).toContainEqual(
          JSON.stringify({ type: 'swarm-error', error: 'Invalid JSON' })
        )
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })

      it('sends error for invalid message schema', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        ws.emit('message', Buffer.from(JSON.stringify({ type: 'unknown-type' })))
        
        const errorMessage = ws.sentMessages.find(m => m.includes('Invalid message'))
        expect(errorMessage).toBeDefined()
      })
    })

    describe('start-swarm message', () => {
      it('enqueues job and sends status', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const message = {
          type: 'start-swarm',
          prompt: 'Test prompt',
          sessionId: 'session-123',
          mode: 'chat',
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        expect(mockJobQueue.enqueue).toHaveBeenCalledWith({
          sessionId: 'session-123',
          prompt: 'Test prompt',
          mode: 'chat',
          idempotencyKey: undefined,
          priority: undefined,
        })
        
        const agentStatusMsg = ws.sentMessages.find(m => 
          m.includes('agent-status') && m.includes('running')
        )
        expect(agentStatusMsg).toBeDefined()
        
        const jobStatusMsg = ws.sentMessages.find(m => m.includes('job-status'))
        expect(jobStatusMsg).toBeDefined()
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })

      it('includes attachments when provided', async () => {
        vi.resetModules()
        vi.clearAllMocks()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { jobQueue } = await import('@/server/job-queue')
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const attachment = { name: 'file.txt', type: 'text/plain', size: 4, content: 'data' }
        const message = {
          type: 'start-swarm',
          prompt: 'Test prompt',
          sessionId: 'session-123',
          attachments: [attachment],
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        expect(jobQueue.enqueue).toHaveBeenCalledWith(
          expect.objectContaining({
            attachments: [attachment],
          })
        )
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })

    describe('cancel-swarm message', () => {
      it('calls cancelSwarm', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { cancelSwarm } = await import('@/server/orchestrator')
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const message = {
          type: 'cancel-swarm',
          sessionId: 'session-123',
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        expect(cancelSwarm).toHaveBeenCalled()
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })

    describe('cancel-job message', () => {
      it('cancels specific job and sends status', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const message = {
          type: 'cancel-job',
          jobId: 'job-456',
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        await vi.waitFor(() => {
          expect(mockJobQueue.cancelJob).toHaveBeenCalledWith('job-456')
        })
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })

    describe('cancel-all-queued message', () => {
      it('cancels all queued jobs', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const message = {
          type: 'cancel-all-queued',
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        await vi.waitFor(() => {
          expect(mockJobQueue.cancelAllQueued).toHaveBeenCalled()
        })
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })

    describe('ping message', () => {
      it('responds with pong', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        ws.emit('message', Buffer.from(JSON.stringify({ type: 'ping' })))
        
        expect(ws.sentMessages).toContainEqual(JSON.stringify({ type: 'pong' }))
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })

    describe('watch-project message', () => {
      it('starts file watcher for valid path', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { startFileWatcher } = await import('@/server/file-watcher')
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const message = {
          type: 'watch-project',
          projectPath: '/test/project',
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        expect(startFileWatcher).toHaveBeenCalledWith('/resolved/path', expect.any(Function))
        
        const statusMsg = ws.sentMessages.find(m => 
          m.includes('file-watcher') && m.includes('running')
        )
        expect(statusMsg).toBeDefined()
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })

      it('sends error for path outside workspace', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { resolvePathWithinWorkspace } = await import('@/server/workspace-path')
        vi.mocked(resolvePathWithinWorkspace).mockReturnValueOnce({
          ok: false,
          error: 'Path outside workspace root',
        })
        
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        const message = {
          type: 'watch-project',
          projectPath: '/etc/passwd',
        }
        
        ws.emit('message', Buffer.from(JSON.stringify(message)))
        
        const errorMsg = ws.sentMessages.find(m => 
          m.includes('swarm-error') && m.includes('outside workspace')
        )
        expect(errorMsg).toBeDefined()
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })

    describe('unwatch-project message', () => {
      it('stops file watcher', async () => {
        vi.resetModules()
        
        const originalEnv = process.env.WS_AUTH_ENABLED
        process.env.WS_AUTH_ENABLED = 'false'
        
        const { stopFileWatcher } = await import('@/server/file-watcher')
        const { startWSServer } = await import('@/server/ws-server')
        
        const mockServer = new EventEmitter() as http.Server
        const wss = startWSServer(mockServer)
        
        const ws = new MockWebSocket()
        wss.emit('connection', ws)
        
        ws.emit('message', Buffer.from(JSON.stringify({ type: 'unwatch-project' })))
        
        expect(stopFileWatcher).toHaveBeenCalled()
        
        const statusMsg = ws.sentMessages.find(m => 
          m.includes('file-watcher') && m.includes('completed')
        )
        expect(statusMsg).toBeDefined()
        
        process.env.WS_AUTH_ENABLED = originalEnv
      })
    })
  })

  describe('authentication', () => {
    it('rejects unauthenticated connections when auth is enabled', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'true'
      
      const { authenticateWSConnection } = await import('@/server/ws-auth')
      vi.mocked(authenticateWSConnection).mockResolvedValueOnce({
        authenticated: false,
        error: 'No token provided',
      })
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      startWSServer(mockServer)
      
      const mockSocket = {
        write: vi.fn(),
        destroy: vi.fn(),
      }
      
      const mockRequest = {
        url: '/ws',
        headers: { host: 'localhost:3000' },
        socket: { remoteAddress: '127.0.0.1' },
      }
      
      mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.alloc(0))
      
      await vi.waitFor(() => {
        expect(mockSocket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n')
        expect(mockSocket.destroy).toHaveBeenCalled()
      })
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('blocks unauthorized operations for viewer role', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'true'
      
      const { canPerformOperation, getRequiredRoleForOperation } = await import('@/server/ws-auth')
      vi.mocked(canPerformOperation).mockReturnValueOnce(false)
      vi.mocked(getRequiredRoleForOperation).mockReturnValueOnce('editor')
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      ws.user = { id: 'user-1', email: 'viewer@example.com', role: 'viewer' }
      ws.authenticated = true
      wss.emit('connection', ws)
      
      const message = {
        type: 'start-swarm',
        prompt: 'Test',
        sessionId: 'session-1',
      }
      
      ws.emit('message', Buffer.from(JSON.stringify(message)))
      
      const errorMsg = ws.sentMessages.find(m => 
        m.includes('Unauthorized') && m.includes('editor role')
      )
      expect(errorMsg).toBeDefined()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })

  describe('broadcastToAll', () => {
    it('sends message to all connected clients', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer, broadcastToAll } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()
      const ws3 = new MockWebSocket()
      ws3.readyState = 3 // CLOSED
      
      wss.clients.add(ws1 as unknown as WSType)
      wss.clients.add(ws2 as unknown as WSType)
      wss.clients.add(ws3 as unknown as WSType)
      
      broadcastToAll({ type: 'pong' })
      
      expect(ws1.sentMessages).toContainEqual(JSON.stringify({ type: 'pong' }))
      expect(ws2.sentMessages).toContainEqual(JSON.stringify({ type: 'pong' }))
      expect(ws3.sentMessages).not.toContainEqual(JSON.stringify({ type: 'pong' }))
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('does nothing when wss is null', async () => {
      vi.resetModules()
      
      const { broadcastToAll } = await import('@/server/ws-server')
      
      expect(() => broadcastToAll({ type: 'pong' })).not.toThrow()
    })
  })

  describe('connection lifecycle', () => {
    it('increments connection counter on connect', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { websocketConnections } = await import('@/lib/metrics')
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      expect(websocketConnections.inc).toHaveBeenCalled()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('decrements connection counter on disconnect', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { websocketConnections } = await import('@/lib/metrics')
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      ws.emit('close')
      
      expect(websocketConnections.dec).toHaveBeenCalled()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('handles pong events to keep connection alive', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      ws.isAlive = false
      wss.emit('connection', ws)
      
      ws.emit('pong')
      
      expect(ws.isAlive).toBe(true)
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })

  describe('error handling', () => {
    it('logs WebSocket errors', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { createLogger } = await import('@/server/logger')
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }
      vi.mocked(createLogger).mockReturnValue(mockLogger)
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      ws.emit('error', new Error('Connection reset'))
      
      expect(mockLogger.error).toHaveBeenCalledWith('WebSocket error', { error: 'Connection reset' })
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('handles file watcher start failure', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startFileWatcher } = await import('@/server/file-watcher')
      vi.mocked(startFileWatcher).mockImplementationOnce(() => {
        throw new Error('Permission denied')
      })
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      const message = {
        type: 'watch-project',
        projectPath: '/test/project',
      }
      
      ws.emit('message', Buffer.from(JSON.stringify(message)))
      
      const errorMsg = ws.sentMessages.find(m => 
        m.includes('swarm-error') && m.includes('Permission denied')
      )
      expect(errorMsg).toBeDefined()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })

  describe('MCP tool calls', () => {
    it('handles mcp-tool-call message', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { getSettings } = await import('@/server/storage')
      vi.mocked(getSettings).mockResolvedValueOnce({
        mcpServers: [
          { id: 'test-server', name: 'Test', command: 'test', enabled: true },
        ],
      } as any)
      
      const { connectMCPServer, callMCPTool } = await import('@/server/mcp-client')
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      const message = {
        type: 'mcp-tool-call',
        call: {
          serverId: 'test-server',
          toolName: 'test-tool',
          args: { param: 'value' },
        },
      }
      
      ws.emit('message', Buffer.from(JSON.stringify(message)))
      
      await vi.waitFor(() => {
        expect(connectMCPServer).toHaveBeenCalled()
        expect(callMCPTool).toHaveBeenCalled()
      })
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('sends error for unknown MCP server', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { getSettings } = await import('@/server/storage')
      vi.mocked(getSettings).mockResolvedValueOnce({
        mcpServers: [],
      } as any)
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      const message = {
        type: 'mcp-tool-call',
        call: {
          serverId: 'unknown-server',
          toolName: 'test-tool',
          args: {},
        },
      }
      
      ws.emit('message', Buffer.from(JSON.stringify(message)))
      
      await vi.waitFor(() => {
        const errorMsg = ws.sentMessages.find(m => 
          m.includes('mcp-tool-error') && m.includes('not found')
        )
        expect(errorMsg).toBeDefined()
      })
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('sends error for disabled MCP server', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { getSettings } = await import('@/server/storage')
      vi.mocked(getSettings).mockResolvedValueOnce({
        mcpServers: [
          { id: 'disabled-server', name: 'Disabled', command: 'test', enabled: false },
        ],
      } as any)
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      const message = {
        type: 'mcp-tool-call',
        call: {
          serverId: 'disabled-server',
          toolName: 'test-tool',
          args: {},
        },
      }
      
      ws.emit('message', Buffer.from(JSON.stringify(message)))
      
      await vi.waitFor(() => {
        const errorMsg = ws.sentMessages.find(m => 
          m.includes('mcp-tool-error') && m.includes('disabled')
        )
        expect(errorMsg).toBeDefined()
      })
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })

  describe('startWSServer', () => {
    it('returns WebSocketServer instance', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      expect(wss).toBeDefined()
      expect(wss).toBeInstanceOf(MockWebSocketServer)
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('initializes and starts scheduler', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      startWSServer(mockServer)
      
      await vi.waitFor(() => {
        expect(mockScheduler.init).toHaveBeenCalled()
        expect(mockScheduler.start).toHaveBeenCalled()
      })
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })

    it('skips LSP WebSocket path', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      startWSServer(mockServer)
      
      const mockSocket = {
        write: vi.fn(),
        destroy: vi.fn(),
      }
      
      const mockRequest = {
        url: '/api/lsp/ws',
        headers: { host: 'localhost:3000' },
        socket: { remoteAddress: '127.0.0.1' },
      }
      
      mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.alloc(0))
      
      expect(mockSocket.write).not.toHaveBeenCalled()
      expect(mockSocket.destroy).not.toHaveBeenCalled()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })

  describe('ticket messages', () => {
    it('accepts ticket-created message without action', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      const message = {
        type: 'ticket-created',
        ticket: {
          id: 'ticket-1',
          projectId: 'proj-1',
          title: 'Test ticket',
          description: 'Description',
          status: 'open',
          priority: 'medium',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }
      
      expect(() => {
        ws.emit('message', Buffer.from(JSON.stringify(message)))
      }).not.toThrow()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })

  describe('confirm-response message', () => {
    it('logs confirm-response without error', async () => {
      vi.resetModules()
      
      const originalEnv = process.env.WS_AUTH_ENABLED
      process.env.WS_AUTH_ENABLED = 'false'
      
      const { startWSServer } = await import('@/server/ws-server')
      
      const mockServer = new EventEmitter() as http.Server
      const wss = startWSServer(mockServer)
      
      const ws = new MockWebSocket()
      wss.emit('connection', ws)
      
      const message = {
        type: 'confirm-response',
        requestId: 'req-123',
        approved: true,
      }
      
      expect(() => {
        ws.emit('message', Buffer.from(JSON.stringify(message)))
      }).not.toThrow()
      
      process.env.WS_AUTH_ENABLED = originalEnv
    })
  })
})
