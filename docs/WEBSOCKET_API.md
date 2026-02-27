# SwarmUI WebSocket API Documentation

## Connection

Connect to the WebSocket server at:
- **Development**: `ws://localhost:3000` (attached to HTTP server)
- **Standalone**: `ws://localhost:3002` (standalone WS server)

## Message Format

All messages are JSON objects with a `type` field:

```typescript
interface WSMessage {
  type: string
  [key: string]: unknown
}
```

## Client → Server Messages

### `start-swarm`
Start a new swarm pipeline execution.

```typescript
{
  type: 'start-swarm',
  sessionId: string,
  prompt: string,
  mode: 'chat' | 'swarm' | 'project',
  projectPath?: string,
  attachments?: Array<{
    name: string,
    type: string,
    size: number,
    content?: string,
    dataUrl?: string
  }>,
  priority?: number,
  source?: 'user' | 'scheduler' | 'api'
}
```

### `cancel-swarm`
Cancel the currently running swarm.

```typescript
{
  type: 'cancel-swarm'
}
```

### `cancel-job`
Cancel a specific job by ID.

```typescript
{
  type: 'cancel-job',
  jobId: string
}
```

### `cancel-all-queued`
Cancel all queued (not running) jobs.

```typescript
{
  type: 'cancel-all-queued'
}
```

### `mcp-tool-call`
Execute an MCP tool call.

```typescript
{
  type: 'mcp-tool-call',
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
}
```

### `ping`
Heartbeat ping (server responds with `pong`).

```typescript
{
  type: 'ping'
}
```

## Server → Client Messages

### `pong`
Response to `ping`.

```typescript
{
  type: 'pong'
}
```

### `agent-output`
Streaming output from an agent.

```typescript
{
  type: 'agent-output',
  agentId: string,
  data: string
}
```

### `agent-status`
Agent lifecycle status change.

```typescript
{
  type: 'agent-status',
  agentId: string,
  status: 'pending' | 'spawning' | 'running' | 'completed' | 'failed' | 'cancelled',
  exitCode?: number
}
```

### `swarm-result`
Final result of a swarm pipeline.

```typescript
{
  type: 'swarm-result',
  result: {
    finalOutput: string,
    confidence: number,
    agents: Array<{
      id: string,
      role: string,
      provider: string,
      status: string,
      output: string,
      exitCode?: number
    }>,
    sources: string[],
    validationPassed: boolean,
    securityPassed: boolean,
    cliExcerpts?: Record<string, string>
  }
}
```

### `swarm-error`
Error during swarm execution.

```typescript
{
  type: 'swarm-error',
  error: string,
  details?: unknown
}
```

### `job-status`
Job status update.

```typescript
{
  type: 'job-status',
  job: {
    id: string,
    sessionId: string,
    prompt: string,
    mode: string,
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',
    progress?: number,
    result?: SwarmResult,
    error?: string,
    createdAt: number,
    startedAt?: number,
    finishedAt?: number
  }
}
```

### `job-queued`
New job added to queue.

```typescript
{
  type: 'job-queued',
  job: SwarmJob,
  queuePosition: number
}
```

### `job-progress`
Job progress update.

```typescript
{
  type: 'job-progress',
  jobId: string,
  progress: number,
  stage?: string
}
```

### `ticket-created`
New ticket created in project mode.

```typescript
{
  type: 'ticket-created',
  ticket: {
    id: string,
    projectId: string,
    title: string,
    description: string,
    status: string,
    complexity: string,
    assignedRole: string
  }
}
```

### `ticket-updated`
Ticket status or content updated.

```typescript
{
  type: 'ticket-updated',
  ticket: Ticket
}
```

### `mcp-tool-result`
Result of an MCP tool call.

```typescript
{
  type: 'mcp-tool-result',
  serverId: string,
  toolName: string,
  result: unknown,
  error?: string
}
```

### `test-started`
Test run started.

```typescript
{
  type: 'test-started',
  jobId: string,
  framework: string
}
```

### `test-output`
Streaming test output.

```typescript
{
  type: 'test-output',
  jobId: string,
  data: string
}
```

### `test-completed`
Test run completed.

```typescript
{
  type: 'test-completed',
  jobId: string,
  summary: {
    id: string,
    framework: string,
    passed: number,
    failed: number,
    skipped: number,
    total: number,
    duration: number,
    results: TestResult[],
    coverage?: CoverageData
  }
}
```

### `test-error`
Test run error.

```typescript
{
  type: 'test-error',
  jobId: string,
  error: string
}
```

## Error Handling

If a message cannot be parsed or is invalid, the server sends:

```typescript
{
  type: 'error',
  message: string,
  originalMessage?: unknown
}
```

## Connection Lifecycle

1. Client connects via WebSocket
2. Server assigns a unique connection ID
3. Client sends `ping` every 30 seconds to keep connection alive
4. Server responds with `pong`
5. If no `ping` received for 60 seconds, server closes connection
6. Client should implement reconnection with exponential backoff

## Example Usage

```javascript
const ws = new WebSocket('ws://localhost:3000')

ws.onopen = () => {
  // Start a swarm
  ws.send(JSON.stringify({
    type: 'start-swarm',
    sessionId: 'session-123',
    prompt: 'Build a React component',
    mode: 'swarm'
  }))
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  
  switch (msg.type) {
    case 'agent-output':
      console.log(`Agent ${msg.agentId}: ${msg.data}`)
      break
    case 'agent-status':
      console.log(`Agent ${msg.agentId} is now ${msg.status}`)
      break
    case 'swarm-result':
      console.log('Swarm completed:', msg.result)
      break
    case 'swarm-error':
      console.error('Swarm error:', msg.error)
      break
  }
}

// Heartbeat
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }))
  }
}, 30000)
```
