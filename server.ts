import './server/als-polyfill'
import { createServer } from 'node:http'
import { parse } from 'node:url'
import { startWSServer } from '@/server/ws-server'
import { startLSPServer, stopLSPServer } from '@/server/lsp-server'
import { cancelSwarm } from '@/server/orchestrator'
import { createLogger } from '@/server/logger'
import { stopFileWatcher } from '@/server/file-watcher'
import { ensureProductionAuthSecret, isAuthSecretConfigured } from '@/lib/auth-env'

const logger = createLogger('server')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST || (dev ? '127.0.0.1' : '0.0.0.0')
const parsedPort = Number.parseInt(process.env.PORT || '3000', 10)
const port = Number.isNaN(parsedPort) ? 3000 : parsedPort

function isIgnorableWsFrameError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const code = (err as { code?: string }).code
  if (code === 'WS_ERR_INVALID_CLOSE_CODE') return true
  return err.message.includes('Invalid WebSocket frame')
}

async function bootstrap(): Promise<void> {
  ensureProductionAuthSecret()
  if (dev && !isAuthSecretConfigured()) {
    logger.warn('No AUTH_SECRET/NEXTAUTH_SECRET configured. Using local-development fallback behavior.')
  }

  const { default: next } = await import('next')
  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  const wss = startWSServer(server)
  startLSPServer(server)

  server.listen(port, hostname, () => {
    logger.info(`SwarmUI ready on http://${hostname}:${port}`)
    logger.info('WebSocket server attached to same port at /api/ws')
    logger.info('LSP WebSocket server available at /api/lsp/ws')
    logger.info(`Mode: ${dev ? 'development' : 'production'}`)
  })

  let shuttingDown = false

  function gracefulShutdown(signal: string): void {
    if (shuttingDown) return
    shuttingDown = true
    logger.info(`Received ${signal}, starting graceful shutdown...`)

    cancelSwarm()
    logger.info('Cancelled running swarms')

    stopFileWatcher()
    logger.info('Stopped file watcher')

    stopLSPServer()
    logger.info('Stopped LSP server')

    for (const client of wss.clients) {
      try {
        client.close(1001, 'Server shutting down')
      } catch {
        // Client may already be closed
      }
    }
    logger.info('Closed WebSocket connections')

    wss.close(() => {
      logger.info('WebSocket server closed')

      server.close(() => {
        logger.info('HTTP server closed')
        process.exit(0)
      })

      setTimeout(() => {
        logger.warn('Graceful shutdown timed out, forcing exit')
        process.exit(1)
      }, 10_000).unref()
    })
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

  process.on('uncaughtException', (err) => {
    if (isIgnorableWsFrameError(err)) {
      logger.warn('Ignored malformed WebSocket frame error', { error: err.message })
      return
    }
    logger.error('Uncaught exception', { error: err instanceof Error ? err.stack ?? err.message : String(err) })
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { error: reason instanceof Error ? reason.stack ?? reason.message : String(reason) })
  })
}

void bootstrap().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err)
  logger.error('Failed to bootstrap server', { error: message })
  process.exit(1)
})
