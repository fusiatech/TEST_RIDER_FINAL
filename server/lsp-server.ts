import { spawn, type ChildProcess } from 'node:child_process'
import { WebSocket, WebSocketServer } from 'ws'
import type http from 'node:http'
import { createLogger } from '@/server/logger'
import { getTempDir } from '@/lib/paths'
import path from 'node:path'
import fs from 'node:fs'

const logger = createLogger('lsp-server')

interface LSPConnection {
  ws: WebSocket
  process: ChildProcess
  language: string
  rootUri?: string
}

const connections = new Map<WebSocket, LSPConnection>()
let lspWss: WebSocketServer | null = null

const SUPPORTED_LANGUAGES = ['typescript', 'javascript'] as const
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
}

function findTsServer(): string | null {
  const possiblePaths = [
    path.join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsserver.js'),
    path.join(process.cwd(), 'node_modules', '.bin', 'tsserver'),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  return null
}

function spawnLanguageServer(language: SupportedLanguage, rootUri?: string): ChildProcess | null {
  const logDir = getTempDir()

  switch (language) {
    case 'typescript':
    case 'javascript': {
      const tsserverPath = findTsServer()
      if (!tsserverPath) {
        logger.error('TypeScript server not found in node_modules')
        return null
      }

      const args = [
        tsserverPath,
        '--stdio',
        '--logVerbosity', 'verbose',
        '--logFile', path.join(logDir, 'tsserver.log'),
      ]

      if (rootUri) {
        const rootPath = rootUri.replace('file://', '').replace(/^\/([A-Za-z]:)/, '$1')
        args.push('--project', rootPath)
      }

      logger.info('Spawning TypeScript server', { path: tsserverPath, args })

      const proc = spawn('node', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: rootUri ? rootUri.replace('file://', '').replace(/^\/([A-Za-z]:)/, '$1') : process.cwd(),
      })

      proc.stderr?.on('data', (data) => {
        logger.warn('tsserver stderr:', { data: data.toString() })
      })

      return proc
    }

    default:
      logger.error('Unsupported language for LSP', { language })
      return null
  }
}

function handleLSPConnection(ws: WebSocket, language: string, rootUri?: string): void {
  if (!isSupportedLanguage(language)) {
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: `Unsupported language: ${language}` },
    }))
    ws.close()
    return
  }

  const proc = spawnLanguageServer(language, rootUri)
  if (!proc) {
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: 'Failed to spawn language server' },
    }))
    ws.close()
    return
  }

  const connection: LSPConnection = { ws, process: proc, language, rootUri }
  connections.set(ws, connection)

  logger.info('LSP connection established', { language, rootUri, pid: proc.pid })

  proc.stdout?.on('data', (data: Buffer) => {
    const content = data.toString()
    const messages = parseContentLengthMessages(content)

    for (const msg of messages) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg)
      }
    }
  })

  proc.on('exit', (code) => {
    logger.info('Language server exited', { language, code })
    connections.delete(ws)
    if (ws.readyState === WebSocket.OPEN) {
      ws.close()
    }
  })

  proc.on('error', (err) => {
    logger.error('Language server error', { language, error: err.message })
    connections.delete(ws)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: err.message },
      }))
      ws.close()
    }
  })

  ws.on('message', (data) => {
    const message = data.toString()
    try {
      JSON.parse(message)
      const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
      proc.stdin?.write(content)
    } catch (err) {
      logger.error('Invalid JSON-RPC message', { error: err instanceof Error ? err.message : String(err) })
    }
  })

  ws.on('close', () => {
    logger.info('LSP WebSocket closed', { language })
    const conn = connections.get(ws)
    if (conn) {
      conn.process.kill()
      connections.delete(ws)
    }
  })

  ws.on('error', (err) => {
    logger.error('LSP WebSocket error', { error: err.message })
    const conn = connections.get(ws)
    if (conn) {
      conn.process.kill()
      connections.delete(ws)
    }
  })
}

let messageBuffer = ''

function parseContentLengthMessages(data: string): string[] {
  messageBuffer += data
  const messages: string[] = []

  while (true) {
    const headerEnd = messageBuffer.indexOf('\r\n\r\n')
    if (headerEnd === -1) break

    const header = messageBuffer.slice(0, headerEnd)
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i)
    if (!contentLengthMatch) {
      messageBuffer = messageBuffer.slice(headerEnd + 4)
      continue
    }

    const contentLength = parseInt(contentLengthMatch[1], 10)
    const messageStart = headerEnd + 4
    const messageEnd = messageStart + contentLength

    if (messageBuffer.length < messageEnd) break

    const message = messageBuffer.slice(messageStart, messageEnd)
    messages.push(message)
    messageBuffer = messageBuffer.slice(messageEnd)
  }

  return messages
}

export function startLSPServer(server: http.Server): WebSocketServer {
  lspWss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`)

    if (url.pathname === '/api/lsp/ws') {
      const language = url.searchParams.get('language') || 'typescript'
      const rootUri = url.searchParams.get('rootUri') || undefined

      lspWss!.handleUpgrade(request, socket, head, (ws) => {
        lspWss!.emit('connection', ws, request)
        handleLSPConnection(ws, language, rootUri)
      })
    }
  })

  logger.info('LSP WebSocket server initialized')
  return lspWss
}

export function stopLSPServer(): void {
  for (const [ws, conn] of connections) {
    conn.process.kill()
    ws.close()
  }
  connections.clear()

  if (lspWss) {
    lspWss.close()
    lspWss = null
  }

  logger.info('LSP server stopped')
}

export function getLSPStats(): { activeConnections: number; languages: string[] } {
  const languages = new Set<string>()
  for (const conn of connections.values()) {
    languages.add(conn.language)
  }

  return {
    activeConnections: connections.size,
    languages: Array.from(languages),
  }
}
