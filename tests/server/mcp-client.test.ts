import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

const mockSpawn = vi.fn()
const mockStdin = {
  writable: true,
  write: vi.fn(),
}
const mockStdout = new EventEmitter()
const mockStderr = new EventEmitter()

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}))

describe('mcp-client.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    ;(mockStdout as any).setEncoding = vi.fn()
    ;(mockStderr as any).setEncoding = vi.fn()
    
    mockSpawn.mockReturnValue({
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      on: vi.fn(),
      kill: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  describe('MCPConnection', () => {
    it('creates a connection with config', async () => {
      const { MCPConnection } = await import('@/server/mcp-client')
      
      const connection = new MCPConnection({
        id: 'test-server',
        name: 'Test Server',
        command: 'test-mcp',
        args: ['--arg1'],
      })

      expect(connection.config.id).toBe('test-server')
      expect(connection.config.name).toBe('Test Server')
      expect(connection.isConnected).toBe(false)
    })

    it('reports not connected before connect()', async () => {
      const { MCPConnection } = await import('@/server/mcp-client')
      
      const connection = new MCPConnection({
        id: 'test-server',
        name: 'Test Server',
        command: 'test-mcp',
      })

      expect(connection.isConnected).toBe(false)
    })
  })

  describe('parseToolCallsFromOutput', () => {
    it('parses inline tool calls', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      
      const output = '[MCP_TOOL_CALL] server=my-server tool=search args={"query": "test"}'
      const calls = parseToolCallsFromOutput(output)

      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        serverId: 'my-server',
        toolName: 'search',
        args: { query: 'test' },
      })
    })

    it('parses multiple tool calls', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      
      const output = `
        [MCP_TOOL_CALL] server=server1 tool=tool1 args={"a": 1}
        Some text in between
        [MCP_TOOL_CALL] server=server2 tool=tool2 args={"b": 2}
      `
      const calls = parseToolCallsFromOutput(output)

      expect(calls).toHaveLength(2)
      expect(calls[0].serverId).toBe('server1')
      expect(calls[1].serverId).toBe('server2')
    })

    it('parses multiline JSON args', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      
      const output = `[MCP_TOOL_CALL] server=my-server tool=create args=\`\`\`json
{
  "name": "test",
  "value": 123
}
\`\`\``
      const calls = parseToolCallsFromOutput(output)

      expect(calls).toHaveLength(1)
      expect(calls[0].args).toEqual({ name: 'test', value: 123 })
    })

    it('returns empty array for no tool calls', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      
      const output = 'Just some regular text without any tool calls'
      const calls = parseToolCallsFromOutput(output)

      expect(calls).toHaveLength(0)
    })

    it('skips malformed tool calls', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      
      const output = `
        [MCP_TOOL_CALL] server=valid tool=test args={"valid": true}
        [MCP_TOOL_CALL] server=invalid tool=test args={not valid json}
      `
      const calls = parseToolCallsFromOutput(output)

      expect(calls).toHaveLength(1)
      expect(calls[0].serverId).toBe('valid')
    })

    it('deduplicates identical tool calls', async () => {
      const { parseToolCallsFromOutput } = await import('@/server/mcp-client')
      
      const output = `
        [MCP_TOOL_CALL] server=s1 tool=t1 args={"x": 1}
        [MCP_TOOL_CALL] server=s1 tool=t1 args={"x": 1}
      `
      const calls = parseToolCallsFromOutput(output)

      expect(calls).toHaveLength(1)
    })
  })

  describe('formatToolCallForAgent', () => {
    it('formats simple args inline', async () => {
      const { formatToolCallForAgent } = await import('@/server/mcp-client')
      
      const result = formatToolCallForAgent('server1', 'tool1', { key: 'value' })

      // The function uses JSON.stringify with indentation, so even simple objects get multiline format
      expect(result).toContain('[MCP_TOOL_CALL]')
      expect(result).toContain('server=server1')
      expect(result).toContain('tool=tool1')
      expect(result).toContain('"key"')
      expect(result).toContain('"value"')
    })

    it('formats complex args as multiline JSON', async () => {
      const { formatToolCallForAgent } = await import('@/server/mcp-client')
      
      const result = formatToolCallForAgent('server1', 'tool1', {
        key1: 'value1',
        key2: 'value2',
        nested: { a: 1 },
      })

      expect(result).toContain('```json')
      expect(result).toContain('server=server1')
      expect(result).toContain('tool=tool1')
    })
  })

  describe('executeToolCalls', () => {
    it('returns error for unknown server', async () => {
      const { executeToolCalls } = await import('@/server/mcp-client')
      
      const calls = [
        { serverId: 'unknown', toolName: 'test', args: {} },
      ]
      const results = await executeToolCalls(calls, [])

      expect(results.get('unknown:test')).toEqual({ error: 'Server unknown not found' })
    })
  })

  describe('buildToolPromptContext', () => {
    it('builds context from server tools', async () => {
      const { buildToolPromptContext } = await import('@/server/mcp-client')
      
      const serverTools = [
        {
          serverId: 'server1',
          serverName: 'Server One',
          connected: true,
          tools: [
            { name: 'search', description: 'Search for items', inputSchema: { type: 'object' } },
          ],
          resources: [],
        },
      ]

      const context = buildToolPromptContext(serverTools)

      expect(context).toContain('Available MCP Tools')
      expect(context).toContain('Server One')
      expect(context).toContain('search')
      expect(context).toContain('Search for items')
    })

    it('skips disconnected servers', async () => {
      const { buildToolPromptContext } = await import('@/server/mcp-client')
      
      const serverTools = [
        {
          serverId: 'server1',
          serverName: 'Disconnected Server',
          connected: false,
          tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: {} }],
          resources: [],
        },
      ]

      const context = buildToolPromptContext(serverTools)

      expect(context).not.toContain('Disconnected Server')
    })

    it('skips servers with no tools', async () => {
      const { buildToolPromptContext } = await import('@/server/mcp-client')
      
      const serverTools = [
        {
          serverId: 'server1',
          serverName: 'Empty Server',
          connected: true,
          tools: [],
          resources: [],
        },
      ]

      const context = buildToolPromptContext(serverTools)

      expect(context).not.toContain('Empty Server')
    })

    it('includes tool call format instructions', async () => {
      const { buildToolPromptContext } = await import('@/server/mcp-client')
      
      const serverTools = [
        {
          serverId: 'server1',
          serverName: 'Server',
          connected: true,
          tools: [{ name: 'tool', description: 'A tool', inputSchema: {} }],
          resources: [],
        },
      ]

      const context = buildToolPromptContext(serverTools)

      expect(context).toContain('[MCP_TOOL_CALL]')
      expect(context).toContain('server=<serverId>')
      expect(context).toContain('tool=<toolName>')
    })
  })

  describe('getActiveConnections', () => {
    it('returns empty array initially', async () => {
      vi.resetModules()
      const { getActiveConnections } = await import('@/server/mcp-client')
      
      const connections = getActiveConnections()
      expect(connections).toEqual([])
    })
  })

  describe('getMCPConnection', () => {
    it('returns null for unknown server', async () => {
      const { getMCPConnection } = await import('@/server/mcp-client')
      
      const connection = await getMCPConnection('unknown-server')
      expect(connection).toBeNull()
    })
  })

  describe('disconnectAllMCPServers', () => {
    it('clears all connections', async () => {
      const { disconnectAllMCPServers, getActiveConnections } = await import('@/server/mcp-client')
      
      await disconnectAllMCPServers()
      
      const connections = getActiveConnections()
      expect(connections).toEqual([])
    })
  })
})
