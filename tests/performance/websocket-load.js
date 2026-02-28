import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Rate, Counter, Trend } from 'k6/metrics'

const wsErrors = new Rate('ws_errors')
const wsMessages = new Counter('ws_messages')
const wsLatency = new Trend('ws_latency')

export const options = {
  vus: 50,
  duration: '1m',
  thresholds: {
    ws_errors: ['rate<0.05'],
    ws_latency: ['p(95)<1000'],
  },
}

const WS_URL = __ENV.WS_URL || 'ws://localhost:3000/api/ws'

export default function () {
  const startTime = Date.now()

  const res = ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      const connectLatency = Date.now() - startTime
      wsLatency.add(connectLatency)
      socket.send(JSON.stringify({ type: 'ping' }))
    })

    socket.on('message', (msg) => {
      wsMessages.add(1)
      try {
        const data = JSON.parse(msg)
        check(data, { 'valid message': (d) => d.type !== undefined })
        if (data.type === 'pong') {
          check(data, { 'pong received': () => true })
        }
      } catch {
        wsErrors.add(1)
      }
    })

    socket.on('error', () => {
      wsErrors.add(1)
    })

    socket.setTimeout(() => {
      socket.close()
    }, 5000)
  })

  const connected = res && res.status === 101
  check(res, { 'ws connected': () => connected })
  if (!connected) {
    wsErrors.add(1)
  }

  sleep(1)
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify(data, null, 2),
    'tests/performance/results/websocket-load-summary.json': JSON.stringify(data),
  }
}
