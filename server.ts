import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { startWSServer } from '@/server/ws-server'
import { startLSPServer, stopLSPServer } from '@/server/lsp-server'
import { cancelSwarm } from '@/server/orchestrator'
import { createLogger } from '@/server/logger'
import { stopFileWatcher } from '@/server/file-watcher'

const logger = createLogger('server')

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '/', true)
    handle(req, res, parsedUrl)
  })

  const wss = startWSServer(server)
  startLSPServer(server)

  server.listen(port, hostname, () => {
    logger.info(`SwarmUI ready on http://${hostname}:${port}`)
    logger.info('WebSocket server attached to same port')
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
})
