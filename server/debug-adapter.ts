import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import * as net from 'net'
import * as path from 'path'
import { generateId } from '@/lib/utils'
import { createLogger } from './logger'
import type {
  Breakpoint,
  DebugConfig,
  DebugSession,
  DebugSessionStatus,
  DebugSessionType,
  EvaluateResult,
  Scope,
  StackFrame,
  Variable,
} from '@/lib/debug-types'
export type {
  Breakpoint,
  DebugConfig,
  DebugSession,
  DebugSessionStatus,
  DebugSessionType,
  EvaluateResult,
  Scope,
  StackFrame,
  Variable,
} from '@/lib/debug-types'

const logger = createLogger('debug-adapter')

interface CDPMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string }
}

class CDPClient extends EventEmitter {
  private socket: net.Socket | null = null
  private messageId = 1
  private pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private buffer = ''

  async connect(port: number, host = '127.0.0.1'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port, host }, () => {
        logger.info(`Connected to CDP on ${host}:${port}`)
        resolve()
      })

      this.socket.on('data', (data) => {
        this.buffer += data.toString()
        this.processBuffer()
      })

      this.socket.on('error', (err) => {
        logger.error('CDP socket error', { message: err.message, stack: err.stack })
        reject(err)
      })

      this.socket.on('close', () => {
        logger.info('CDP connection closed')
        this.emit('close')
      })
    })
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\r\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const message: CDPMessage = JSON.parse(line)
        this.handleMessage(message)
      } catch (e) {
        logger.error('Failed to parse CDP message', { line, error: e })
      }
    }
  }

  private handleMessage(message: CDPMessage): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
      }
    } else if (message.method) {
      this.emit(message.method, message.params)
    }
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket) {
      throw new Error('Not connected to CDP')
    }

    const id = this.messageId++
    const message = JSON.stringify({ id, method, params })

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.socket!.write(message + '\r\n')

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`CDP request timeout: ${method}`))
        }
      }, 30000)
    })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.pendingRequests.clear()
  }
}

export class DebugAdapter extends EventEmitter {
  private sessions = new Map<string, DebugSession>()
  private processes = new Map<string, ChildProcess>()
  private cdpClients = new Map<string, CDPClient>()
  private breakpointIdCounter = 0

  async startSession(config: DebugConfig): Promise<DebugSession> {
    const sessionId = generateId()
    
    const session: DebugSession = {
      id: sessionId,
      type: config.type,
      status: 'idle',
      breakpoints: [],
      callStack: [],
      variables: [],
      scopes: [],
      currentFrameId: null,
      config,
      startedAt: Date.now(),
    }

    this.sessions.set(sessionId, session)

    try {
      if (config.type === 'node') {
        await this.startNodeSession(session)
      } else if (config.type === 'python') {
        await this.startPythonSession(session)
      } else {
        throw new Error(`Unsupported debug type: ${config.type}`)
      }

      session.status = config.stopOnEntry ? 'paused' : 'running'
      this.emit('session-started', session)
      return session
    } catch (error) {
      this.sessions.delete(sessionId)
      throw error
    }
  }

  private async startNodeSession(session: DebugSession): Promise<void> {
    const { config } = session
    if (!config.program) {
      throw new Error('Program path is required for Node.js debugging')
    }

    const inspectPort = config.port || 9229
    const args = [
      `--inspect-brk=${inspectPort}`,
      config.program,
      ...(config.args || []),
    ]

    logger.info('Starting Node.js debug session', { sessionId: session.id, args })

    const proc = spawn('node', args, {
      cwd: config.cwd || process.cwd(),
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.processes.set(session.id, proc)

    proc.stdout?.on('data', (data) => {
      this.emit('output', { sessionId: session.id, category: 'stdout', output: data.toString() })
    })

    proc.stderr?.on('data', (data) => {
      const output = data.toString()
      this.emit('output', { sessionId: session.id, category: 'stderr', output })
      
      if (output.includes('Debugger listening on')) {
        logger.info('Node.js debugger ready', { sessionId: session.id })
      }
    })

    proc.on('exit', (code) => {
      logger.info('Node.js process exited', { sessionId: session.id, code })
      session.status = 'stopped'
      session.stoppedAt = Date.now()
      session.stoppedReason = `Process exited with code ${code}`
      this.emit('session-stopped', session)
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    const cdp = new CDPClient()
    await cdp.connect(inspectPort)
    this.cdpClients.set(session.id, cdp)

    await cdp.send('Runtime.enable')
    await cdp.send('Debugger.enable')

    cdp.on('Debugger.paused', async (params: Record<string, unknown>) => {
      session.status = 'paused'
      session.stoppedReason = params.reason as string
      
      const callFrames = params.callFrames as Array<{
        callFrameId: string
        functionName: string
        location: { scriptId: string; lineNumber: number; columnNumber: number }
        url: string
      }>

      session.callStack = callFrames.map((frame, index) => ({
        id: index,
        name: frame.functionName || '(anonymous)',
        file: frame.url || 'unknown',
        line: frame.location.lineNumber + 1,
        column: frame.location.columnNumber + 1,
      }))

      if (callFrames.length > 0) {
        session.currentFrameId = 0
        await this.loadScopes(session.id, 0)
      }

      this.emit('session-paused', session)
    })

    cdp.on('Debugger.resumed', () => {
      session.status = 'running'
      session.callStack = []
      session.variables = []
      session.scopes = []
      session.currentFrameId = null
      this.emit('session-resumed', session)
    })

    cdp.on('close', () => {
      if (session.status !== 'stopped') {
        session.status = 'stopped'
        session.stoppedAt = Date.now()
        this.emit('session-stopped', session)
      }
    })

    if (!config.stopOnEntry) {
      await cdp.send('Debugger.resume')
    }
  }

  private async startPythonSession(session: DebugSession): Promise<void> {
    const { config } = session
    if (!config.program) {
      throw new Error('Program path is required for Python debugging')
    }

    const debugPort = config.port || 5678
    const args = [
      '-m', 'debugpy',
      '--listen', `127.0.0.1:${debugPort}`,
      '--wait-for-client',
      config.program,
      ...(config.args || []),
    ]

    logger.info('Starting Python debug session', { sessionId: session.id, args })

    const proc = spawn('python', args, {
      cwd: config.cwd || process.cwd(),
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.processes.set(session.id, proc)

    proc.stdout?.on('data', (data) => {
      this.emit('output', { sessionId: session.id, category: 'stdout', output: data.toString() })
    })

    proc.stderr?.on('data', (data) => {
      this.emit('output', { sessionId: session.id, category: 'stderr', output: data.toString() })
    })

    proc.on('exit', (code) => {
      logger.info('Python process exited', { sessionId: session.id, code })
      session.status = 'stopped'
      session.stoppedAt = Date.now()
      session.stoppedReason = `Process exited with code ${code}`
      this.emit('session-stopped', session)
    })

    session.status = 'running'
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    logger.info('Stopping debug session', { sessionId })

    const cdp = this.cdpClients.get(sessionId)
    if (cdp) {
      cdp.disconnect()
      this.cdpClients.delete(sessionId)
    }

    const proc = this.processes.get(sessionId)
    if (proc) {
      proc.kill('SIGTERM')
      this.processes.delete(sessionId)
    }

    session.status = 'stopped'
    session.stoppedAt = Date.now()
    this.emit('session-stopped', session)
  }

  async setBreakpoint(sessionId: string, file: string, line: number, condition?: string): Promise<Breakpoint> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const breakpoint: Breakpoint = {
      id: `bp-${++this.breakpointIdCounter}`,
      file,
      line,
      enabled: true,
      condition,
      verified: false,
    }

    const cdp = this.cdpClients.get(sessionId)
    if (cdp && session.type === 'node') {
      try {
        const result = await cdp.send('Debugger.setBreakpointByUrl', {
          lineNumber: line - 1,
          urlRegex: this.fileToUrlRegex(file),
          condition,
        }) as { breakpointId: string; locations: Array<{ lineNumber: number; columnNumber: number }> }

        if (result.locations && result.locations.length > 0) {
          breakpoint.verified = true
          breakpoint.line = result.locations[0].lineNumber + 1
          breakpoint.column = result.locations[0].columnNumber + 1
        }
      } catch (error) {
        logger.error('Failed to set breakpoint', { sessionId, file, line, error })
      }
    }

    session.breakpoints.push(breakpoint)
    this.emit('breakpoint-set', { sessionId, breakpoint })
    return breakpoint
  }

  private fileToUrlRegex(file: string): string {
    const normalized = file.replace(/\\/g, '/')
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return `.*${escaped}$`
  }

  async removeBreakpoint(sessionId: string, breakpointId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const index = session.breakpoints.findIndex((bp) => bp.id === breakpointId)
    if (index === -1) {
      throw new Error(`Breakpoint not found: ${breakpointId}`)
    }

    const cdp = this.cdpClients.get(sessionId)
    if (cdp && session.type === 'node') {
      try {
        await cdp.send('Debugger.removeBreakpoint', { breakpointId })
      } catch (error) {
        logger.error('Failed to remove breakpoint', { sessionId, breakpointId, error })
      }
    }

    session.breakpoints.splice(index, 1)
    this.emit('breakpoint-removed', { sessionId, breakpointId })
  }

  async toggleBreakpoint(sessionId: string, breakpointId: string): Promise<Breakpoint> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const breakpoint = session.breakpoints.find((bp) => bp.id === breakpointId)
    if (!breakpoint) {
      throw new Error(`Breakpoint not found: ${breakpointId}`)
    }

    breakpoint.enabled = !breakpoint.enabled
    this.emit('breakpoint-toggled', { sessionId, breakpoint })
    return breakpoint
  }

  async continue(sessionId: string): Promise<void> {
    const cdp = this.cdpClients.get(sessionId)
    if (!cdp) {
      throw new Error(`No CDP client for session: ${sessionId}`)
    }

    await cdp.send('Debugger.resume')
  }

  async stepOver(sessionId: string): Promise<void> {
    const cdp = this.cdpClients.get(sessionId)
    if (!cdp) {
      throw new Error(`No CDP client for session: ${sessionId}`)
    }

    await cdp.send('Debugger.stepOver')
  }

  async stepInto(sessionId: string): Promise<void> {
    const cdp = this.cdpClients.get(sessionId)
    if (!cdp) {
      throw new Error(`No CDP client for session: ${sessionId}`)
    }

    await cdp.send('Debugger.stepInto')
  }

  async stepOut(sessionId: string): Promise<void> {
    const cdp = this.cdpClients.get(sessionId)
    if (!cdp) {
      throw new Error(`No CDP client for session: ${sessionId}`)
    }

    await cdp.send('Debugger.stepOut')
  }

  async pause(sessionId: string): Promise<void> {
    const cdp = this.cdpClients.get(sessionId)
    if (!cdp) {
      throw new Error(`No CDP client for session: ${sessionId}`)
    }

    await cdp.send('Debugger.pause')
  }

  async getCallStack(sessionId: string): Promise<StackFrame[]> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return session.callStack
  }

  private async loadScopes(sessionId: string, frameId: number): Promise<void> {
    const session = this.sessions.get(sessionId)
    const cdp = this.cdpClients.get(sessionId)
    if (!session || !cdp) return

    const callFrame = session.callStack[frameId]
    if (!callFrame) return

    session.scopes = [
      { name: 'Local', variablesReference: frameId * 1000 + 1, expensive: false },
      { name: 'Closure', variablesReference: frameId * 1000 + 2, expensive: false },
      { name: 'Global', variablesReference: frameId * 1000 + 3, expensive: true },
    ]
  }

  async getVariables(sessionId: string, scopeReference: number): Promise<Variable[]> {
    const session = this.sessions.get(sessionId)
    const cdp = this.cdpClients.get(sessionId)
    if (!session || !cdp) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const frameId = Math.floor(scopeReference / 1000)
    const scopeIndex = (scopeReference % 1000) - 1

    if (frameId >= session.callStack.length) {
      return []
    }

    try {
      const result = await cdp.send('Runtime.getProperties', {
        objectId: `scope:${frameId}:${scopeIndex}`,
        ownProperties: true,
        generatePreview: true,
      }) as { result: Array<{ name: string; value?: { type: string; value?: unknown; description?: string; objectId?: string } }> }

      return (result.result || []).map((prop) => ({
        name: prop.name,
        value: prop.value?.description || String(prop.value?.value ?? 'undefined'),
        type: prop.value?.type || 'undefined',
        variablesReference: prop.value?.objectId ? parseInt(prop.value.objectId, 10) || 0 : 0,
        evaluateName: prop.name,
      }))
    } catch (error) {
      logger.error('Failed to get variables', { sessionId, scopeReference, error })
      return []
    }
  }

  async getScopes(sessionId: string, frameId: number): Promise<Scope[]> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (session.currentFrameId !== frameId) {
      session.currentFrameId = frameId
      await this.loadScopes(sessionId, frameId)
    }

    return session.scopes
  }

  async evaluate(sessionId: string, expression: string, frameId?: number): Promise<EvaluateResult> {
    const cdp = this.cdpClients.get(sessionId)
    if (!cdp) {
      throw new Error(`No CDP client for session: ${sessionId}`)
    }

    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression,
        contextId: frameId,
        returnByValue: false,
        generatePreview: true,
      }) as { result: { type: string; value?: unknown; description?: string; objectId?: string }; exceptionDetails?: { text: string } }

      if (result.exceptionDetails) {
        return {
          result: `Error: ${result.exceptionDetails.text}`,
          type: 'error',
          variablesReference: 0,
        }
      }

      return {
        result: result.result.description || String(result.result.value ?? 'undefined'),
        type: result.result.type,
        variablesReference: result.result.objectId ? parseInt(result.result.objectId, 10) || 0 : 0,
      }
    } catch (error) {
      return {
        result: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        variablesReference: 0,
      }
    }
  }

  getSession(sessionId: string): DebugSession | undefined {
    return this.sessions.get(sessionId)
  }

  getAllSessions(): DebugSession[] {
    return Array.from(this.sessions.values())
  }

  cleanup(): void {
    for (const [sessionId] of this.sessions) {
      void this.stopSession(sessionId)
    }
    this.sessions.clear()
    this.processes.clear()
    this.cdpClients.clear()
  }
}

let debugAdapterInstance: DebugAdapter | null = null

export function getDebugAdapter(): DebugAdapter {
  if (!debugAdapterInstance) {
    debugAdapterInstance = new DebugAdapter()
  }
  return debugAdapterInstance
}
