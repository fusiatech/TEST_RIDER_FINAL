import http from 'node:http'
import { startWSServer } from './ws-server'

const server = http.createServer()
startWSServer(server)
const port = 5175
server.listen(port, () => {
  console.log(`SwarmUI WebSocket server running on ws://localhost:${port}/api/ws`)
})
