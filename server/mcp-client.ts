import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

/* ── Types ────────────────────────────────────────────────────────── */

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type MCPConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'

export interface MCPConnectionLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: unknown
}

export interface MCPServerHealth {
  status: MCPConnectionStatus
  lastConnected?: number
  lastError?: string
  reconnectAttempts: number
  uptime?: number
  latency?: number
}

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface JSONRPCNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/* ── MCPConnection Class ──────────────────────────────────────────── */

export class MCPConnection extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer = ''
  private pendingRequests = new Map<string | number, PendingRequest>()
  private requestId = 0
  private initialized = false
  private serverCapabilities: Record<string, unknown> = {}
  private _status: MCPConnectionStatus = 'disconnected'
  private _logs: MCPConnectionLog[] = []
  private _health: MCPServerHealth = {
    status: 'disconnected',
    reconnectAttempts: 0,
  }
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectedAt: number | null = null
  private autoReconnect = true
  private maxReconnectAttempts = 5
  private reconnectDelayMs = 2000

  readonly config: MCPServerConfig
  readonly REQUEST_TIMEOUT_MS = 30000
  readonly MAX_LOGS = 100

  constructor(config: MCPServerConfig) {
    super()
    this.config = config
  }

  get isConnected(): boolean {
    return this.process !== null && this.initialized
  }

  get status(): MCPConnectionStatus {
    return this._status
  }

  get logs(): MCPConnectionLog[] {
    return [...this._logs]
  }

  get health(): MCPServerHealth {
    return {
      ...this._health,
      uptime: this.connectedAt ? Date.now() - this.connectedAt : undefined,
    }
  }

  private setStatus(status: MCPConnectionStatus): void {
    this._status = status
    this._health.status = status
    this.emit('status-change', status)
  }

  private addLog(level: MCPConnectionLog['level'], message: string, data?: unknown): void {
    const log: MCPConnectionLog = {
      timestamp: Date.now(),
      level,
      message,
      data,
    }
    this._logs.push(log)
    if (this._logs.length > this.MAX_LOGS) {
      this._logs.shift()
    }
    this.emit('log', log)
  }

  clearLogs(): void {
    this._logs = []
  }

  setAutoReconnect(enabled: boolean, maxAttempts = 5, delayMs = 2000): void {
    this.autoReconnect = enabled
    this.maxReconnectAttempts = maxAttempts
    this.reconnectDelayMs = delayMs
  }

  async connect(): Promise<void> {
    if (this.process) {
      throw new Error('Already connected')
    }

    this.setStatus('connecting')
    this.addLog('info', `Connecting to MCP server: ${this.config.name}`)

    const env: NodeJS.ProcessEnv = { ...process.env }
    if (this.config.env) {
      Object.assign(env, this.config.env)
    }

    try {
      this.process = spawn(this.config.command, this.config.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: process.platform === 'win32',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.addLog('error', `Failed to spawn process: ${message}`)
      this.setStatus('error')
      this._health.lastError = message
      throw err
    }

    const proc = this.process
    if (proc.stdout) {
      proc.stdout.setEncoding('utf-8')
      proc.stdout.on('data', (data: string) => {
        this.handleData(data)
      })
    }
    
    if (proc.stderr) {
      proc.stderr.setEncoding('utf-8')
      proc.stderr.on('data', (data: string) => {
        this.addLog('warn', `stderr: ${data.trim()}`)
        this.emit('stderr', data)
      })
    }

    proc.on('error', (err) => {
      this.addLog('error', `Process error: ${err.message}`)
      this._health.lastError = err.message
      this.setStatus('error')
      this.emit('error', err)
      this.cleanup()
      this.scheduleReconnect()
    })

    proc.on('exit', (code, signal) => {
      this.addLog('info', `Process exited with code ${code}, signal ${signal}`)
      this.emit('exit', { code, signal })
      this.cleanup()
      if (code !== 0 && this.autoReconnect) {
        this.scheduleReconnect()
      }
    })

    await this.initialize()
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect) return
    if (this._health.reconnectAttempts >= this.maxReconnectAttempts) {
      this.addLog('error', `Max reconnect attempts (${this.maxReconnectAttempts}) reached`)
      this.setStatus('error')
      return
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this._health.reconnectAttempts++
    const delay = this.reconnectDelayMs * Math.pow(2, this._health.reconnectAttempts - 1)
    this.addLog('info', `Scheduling reconnect attempt ${this._health.reconnectAttempts} in ${delay}ms`)
    this.setStatus('reconnecting')

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.addLog('error', `Reconnect failed: ${message}`)
      }
    }, delay)
  }

  cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this._health.reconnectAttempts = 0
  }

  private async initialize(): Promise<void> {
    this.addLog('debug', 'Sending initialize request')
    const startTime = Date.now()
    
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'SwarmUI',
        version: '1.0.0',
      },
    }) as { capabilities?: Record<string, unknown> }

    this._health.latency = Date.now() - startTime
    this.serverCapabilities = result.capabilities ?? {}
    this.addLog('debug', 'Server capabilities received', this.serverCapabilities)

    await this.sendNotification('notifications/initialized', {})
    this.initialized = true
    this.connectedAt = Date.now()
    this._health.lastConnected = this.connectedAt
    this._health.reconnectAttempts = 0
    this.setStatus('connected')
    this.addLog('info', `Connected to ${this.config.name} (latency: ${this._health.latency}ms)`)
    this.emit('connected')
  }

  getCapabilities(): Record<string, unknown> {
    return { ...this.serverCapabilities }
  }

  private handleData(data: string): void {
    this.buffer += data

    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const message = JSON.parse(line) as JSONRPCResponse | JSONRPCNotification
        this.handleMessage(message)
      } catch {
        this.emit('parse-error', line)
      }
    }
  }

  private handleMessage(message: JSONRPCResponse | JSONRPCNotification): void {
    if ('id' in message && message.id !== null) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        clearTimeout(pending.timeout)

        if (message.error) {
          pending.reject(new Error(`MCP Error ${message.error.code}: ${message.error.message}`))
        } else {
          pending.resolve(message.result)
        }
      }
    } else if ('method' in message) {
      this.emit('notification', message)
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error('Not connected'))
        return
      }

      const id = ++this.requestId
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timed out: ${method}`))
      }, this.REQUEST_TIMEOUT_MS)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      const json = JSON.stringify(request)
      this.process.stdin.write(json + '\n')
    })
  }

  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Not connected')
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method,
      params,
    }

    const json = JSON.stringify(notification)
    this.process.stdin.write(json + '\n')
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      throw new Error('Not initialized')
    }

    const result = await this.sendRequest('tools/list', {}) as { tools?: MCPTool[] }
    return result.tools ?? []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.initialized) {
      throw new Error('Not initialized')
    }

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    }) as { content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }

    if (result.content && result.content.length > 0) {
      const textContent = result.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text)
        .join('\n')
      if (textContent) return textContent

      const imageContent = result.content.find((c) => c.type === 'image')
      if (imageContent) {
        return { type: 'image', data: imageContent.data, mimeType: imageContent.mimeType }
      }
    }

    return result
  }

  async listResources(): Promise<MCPResource[]> {
    if (!this.initialized) {
      throw new Error('Not initialized')
    }

    const result = await this.sendRequest('resources/list', {}) as { resources?: MCPResource[] }
    return result.resources ?? []
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.initialized) {
      throw new Error('Not initialized')
    }

    const result = await this.sendRequest('resources/read', { uri }) as {
      contents?: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>
    }
    return result.contents?.[0]
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect()
    this.autoReconnect = false
    
    if (!this.process) return

    this.addLog('info', 'Disconnecting from server')

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Connection closed'))
      this.pendingRequests.delete(id)
    }

    this.process.kill('SIGTERM')
    this.cleanup()
  }

  private cleanup(): void {
    this.process = null
    this.initialized = false
    this.buffer = ''
    this.connectedAt = null
    this.setStatus('disconnected')
  }

  async ping(): Promise<number> {
    if (!this.initialized) {
      throw new Error('Not initialized')
    }
    const start = Date.now()
    await this.sendRequest('ping', {})
    const latency = Date.now() - start
    this._health.latency = latency
    return latency
  }
}

/* ── Connection Manager ───────────────────────────────────────────── */

const connections = new Map<string, MCPConnection>()

export async function connectMCPServer(
  config: MCPServerConfig,
  options?: { autoReconnect?: boolean; maxReconnectAttempts?: number }
): Promise<MCPConnection> {
  const existing = connections.get(config.id)
  if (existing?.isConnected) {
    return existing
  }

  const connection = new MCPConnection(config)
  if (options?.autoReconnect !== undefined) {
    connection.setAutoReconnect(
      options.autoReconnect,
      options.maxReconnectAttempts ?? 5
    )
  }
  await connection.connect()
  connections.set(config.id, connection)
  return connection
}

export function getMCPConnection(serverId: string): MCPConnection | null {
  return connections.get(serverId) ?? null
}

export async function listMCPTools(connection: MCPConnection): Promise<MCPTool[]> {
  return connection.listTools()
}

export async function callMCPTool(
  connection: MCPConnection,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return connection.callTool(toolName, args)
}

export async function disconnectMCPServer(connection: MCPConnection): Promise<void> {
  connections.delete(connection.config.id)
  await connection.disconnect()
}

export async function disconnectAllMCPServers(): Promise<void> {
  const disconnectPromises = Array.from(connections.values()).map((conn) =>
    conn.disconnect().catch(() => {})
  )
  await Promise.all(disconnectPromises)
  connections.clear()
}

export function getActiveConnections(): MCPConnection[] {
  return Array.from(connections.values()).filter((c) => c.isConnected)
}

export function getAllConnections(): Map<string, MCPConnection> {
  return new Map(connections)
}

export interface MCPServerStatus {
  id: string
  name: string
  status: MCPConnectionStatus
  health: MCPServerHealth
  logs: MCPConnectionLog[]
  tools: MCPTool[]
  resources: MCPResource[]
  capabilities: Record<string, unknown>
}

export async function getServerStatus(serverId: string): Promise<MCPServerStatus | null> {
  const connection = connections.get(serverId)
  if (!connection) return null

  let tools: MCPTool[] = []
  let resources: MCPResource[] = []

  if (connection.isConnected) {
    try {
      tools = await connection.listTools()
    } catch {
      // Tools may not be available
    }
    try {
      resources = await connection.listResources()
    } catch {
      // Resources may not be supported
    }
  }

  return {
    id: connection.config.id,
    name: connection.config.name,
    status: connection.status,
    health: connection.health,
    logs: connection.logs,
    tools,
    resources,
    capabilities: connection.getCapabilities(),
  }
}

export async function getAllServerStatuses(): Promise<MCPServerStatus[]> {
  const statuses: MCPServerStatus[] = []
  for (const [id] of connections) {
    const status = await getServerStatus(id)
    if (status) statuses.push(status)
  }
  return statuses
}

/* ── Tool Call Parser (for agent output) ──────────────────────────── */

export interface ParsedToolCall {
  serverId: string
  toolName: string
  args: Record<string, unknown>
}

const TOOL_CALL_PATTERN_INLINE = /\[MCP_TOOL_CALL\]\s*server=([^\s]+)\s+tool=([^\s]+)\s+args=(\{[^}]+\})/g

const TOOL_CALL_PATTERN_MULTILINE = /\[MCP_TOOL_CALL\]\s*server=([^\s]+)\s+tool=([^\s]+)\s+args=(```json\s*([\s\S]*?)\s*```|\{[\s\S]*?\}(?=\s*(?:\[MCP_TOOL_CALL\]|$)))/g

export function parseToolCallsFromOutput(output: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = []
  const seen = new Set<string>()

  for (const pattern of [TOOL_CALL_PATTERN_INLINE, TOOL_CALL_PATTERN_MULTILINE]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(output)) !== null) {
      try {
        const serverId = match[1]
        const toolName = match[2]
        let argsStr = match[3]
        
        if (argsStr.startsWith('```json')) {
          argsStr = match[4] ?? '{}'
        }
        
        argsStr = argsStr.trim()
        const args = JSON.parse(argsStr) as Record<string, unknown>
        const key = `${serverId}:${toolName}:${JSON.stringify(args)}`
        
        if (!seen.has(key)) {
          seen.add(key)
          calls.push({ serverId, toolName, args })
        }
      } catch {
        // Skip malformed tool calls
      }
    }
  }

  return calls
}

export function formatToolCallForAgent(serverId: string, toolName: string, args: Record<string, unknown>): string {
  const argsStr = JSON.stringify(args, null, 2)
  if (argsStr.includes('\n')) {
    return `[MCP_TOOL_CALL] server=${serverId} tool=${toolName} args=\`\`\`json\n${argsStr}\n\`\`\``
  }
  return `[MCP_TOOL_CALL] server=${serverId} tool=${toolName} args=${JSON.stringify(args)}`
}

export async function executeToolCalls(
  calls: ParsedToolCall[],
  serverConfigs: MCPServerConfig[]
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>()

  for (const call of calls) {
    const config = serverConfigs.find((s) => s.id === call.serverId)
    if (!config) {
      results.set(`${call.serverId}:${call.toolName}`, { error: `Server ${call.serverId} not found` })
      continue
    }

    try {
      const connection = await connectMCPServer(config)
      const result = await callMCPTool(connection, call.toolName, call.args)
      results.set(`${call.serverId}:${call.toolName}`, result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.set(`${call.serverId}:${call.toolName}`, { error: message })
    }
  }

  return results
}

/* ── Batch Operations ─────────────────────────────────────────────── */

export interface ServerToolsInfo {
  serverId: string
  serverName: string
  connected: boolean
  tools: MCPTool[]
  resources: MCPResource[]
  error?: string
}

export async function getAllServerTools(
  serverConfigs: MCPServerConfig[]
): Promise<ServerToolsInfo[]> {
  const results: ServerToolsInfo[] = []

  for (const config of serverConfigs) {
    try {
      const connection = await connectMCPServer(config)
      const tools = await connection.listTools()
      let resources: MCPResource[] = []
      try {
        resources = await connection.listResources()
      } catch {
        // Resources may not be supported
      }

      results.push({
        serverId: config.id,
        serverName: config.name,
        connected: true,
        tools,
        resources,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        serverId: config.id,
        serverName: config.name,
        connected: false,
        tools: [],
        resources: [],
        error: message,
      })
    }
  }

  return results
}

export function buildToolPromptContext(serverTools: ServerToolsInfo[]): string {
  const lines: string[] = ['Available MCP Tools:']

  for (const server of serverTools) {
    if (!server.connected || server.tools.length === 0) continue

    lines.push(`\n## Server: ${server.serverName} (${server.serverId})`)
    for (const tool of server.tools) {
      lines.push(`- **${tool.name}**: ${tool.description}`)
      if (tool.inputSchema && Object.keys(tool.inputSchema).length > 0) {
        const schemaStr = JSON.stringify(tool.inputSchema, null, 2)
          .split('\n')
          .map((l) => `    ${l}`)
          .join('\n')
        lines.push(`  Input schema:\n${schemaStr}`)
      }
    }
  }

  lines.push('\nTo call an MCP tool, use this format:')
  lines.push('[MCP_TOOL_CALL] server=<serverId> tool=<toolName> args={"param": "value"}')

  return lines.join('\n')
}
