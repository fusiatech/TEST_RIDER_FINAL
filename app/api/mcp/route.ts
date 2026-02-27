import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSettings } from '@/server/storage'
import {
  connectMCPServer,
  listMCPTools,
  callMCPTool,
  disconnectMCPServer,
  getActiveConnections,
  getMCPConnection,
  getServerStatus,
  getAllServerStatuses,
  type MCPServerConfig,
  type MCPTool,
  type MCPResource,
  type MCPConnectionStatus,
  type MCPServerHealth,
  type MCPConnectionLog,
} from '@/server/mcp-client'

const CallToolRequestSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()).optional().default({}),
})

const TestConnectionRequestSchema = z.object({
  serverId: z.string(),
})

const ReadResourceRequestSchema = z.object({
  serverId: z.string(),
  uri: z.string(),
})

interface ServerWithTools {
  id: string
  name: string
  command: string
  enabled: boolean
  connected: boolean
  status: MCPConnectionStatus
  health?: MCPServerHealth
  tools: MCPTool[]
  resources: MCPResource[]
  logs?: MCPConnectionLog[]
  capabilities?: Record<string, unknown>
  error?: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')
    const includeLogs = searchParams.get('logs') === 'true'

    if (serverId) {
      const status = await getServerStatus(serverId)
      if (!status) {
        return NextResponse.json({ error: 'Server not found' }, { status: 404 })
      }
      return NextResponse.json(status)
    }

    const settings = await getSettings()
    const mcpServers = settings.mcpServers ?? []
    const enabledServers = mcpServers.filter((s) => s.enabled)

    const results: ServerWithTools[] = []

    for (const server of enabledServers) {
      const config: MCPServerConfig = {
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
      }

      try {
        const connection = await connectMCPServer(config, { autoReconnect: true })
        const tools = await listMCPTools(connection)
        let resources: MCPResource[] = []
        try {
          resources = await connection.listResources()
        } catch {
          // Resources may not be supported
        }

        const serverResult: ServerWithTools = {
          id: server.id,
          name: server.name,
          command: server.command,
          enabled: server.enabled,
          connected: true,
          status: connection.status,
          health: connection.health,
          tools,
          resources,
          capabilities: connection.getCapabilities(),
        }

        if (includeLogs) {
          serverResult.logs = connection.logs
        }

        results.push(serverResult)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const existingConnection = getMCPConnection(server.id)
        
        results.push({
          id: server.id,
          name: server.name,
          command: server.command,
          enabled: server.enabled,
          connected: false,
          status: existingConnection?.status ?? 'error',
          health: existingConnection?.health,
          tools: [],
          resources: [],
          logs: includeLogs ? existingConnection?.logs : undefined,
          error: message,
        })
      }
    }

    const disabledServers = mcpServers.filter((s) => !s.enabled)
    for (const server of disabledServers) {
      results.push({
        id: server.id,
        name: server.name,
        command: server.command,
        enabled: false,
        connected: false,
        status: 'disconnected',
        tools: [],
        resources: [],
      })
    }

    return NextResponse.json({
      servers: results,
      activeConnections: getActiveConnections().length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'test') {
      const parsed = TestConnectionRequestSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: `Invalid request: ${parsed.error.message}` },
          { status: 400 }
        )
      }

      const { serverId } = parsed.data
      const settings = await getSettings()
      const mcpServers = settings.mcpServers ?? []
      const serverConfig = mcpServers.find((s) => s.id === serverId)

      if (!serverConfig) {
        return NextResponse.json(
          { error: `Server ${serverId} not found` },
          { status: 404 }
        )
      }

      const config: MCPServerConfig = {
        id: serverConfig.id,
        name: serverConfig.name,
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      }

      const startTime = Date.now()
      try {
        const connection = await connectMCPServer(config, { autoReconnect: false })
        const tools = await listMCPTools(connection)
        let resources: MCPResource[] = []
        try {
          resources = await connection.listResources()
        } catch {
          // Resources may not be supported
        }

        return NextResponse.json({
          success: true,
          serverId,
          latency: Date.now() - startTime,
          toolCount: tools.length,
          resourceCount: resources.length,
          capabilities: connection.getCapabilities(),
          health: connection.health,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return NextResponse.json({
          success: false,
          serverId,
          latency: Date.now() - startTime,
          error: message,
        })
      }
    }

    if (action === 'read-resource') {
      const parsed = ReadResourceRequestSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: `Invalid request: ${parsed.error.message}` },
          { status: 400 }
        )
      }

      const { serverId, uri } = parsed.data
      const settings = await getSettings()
      const mcpServers = settings.mcpServers ?? []
      const serverConfig = mcpServers.find((s) => s.id === serverId)

      if (!serverConfig) {
        return NextResponse.json(
          { error: `Server ${serverId} not found` },
          { status: 404 }
        )
      }

      const config: MCPServerConfig = {
        id: serverConfig.id,
        name: serverConfig.name,
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      }

      const connection = await connectMCPServer(config)
      const content = await connection.readResource(uri)

      return NextResponse.json({
        serverId,
        uri,
        content,
        timestamp: Date.now(),
      })
    }

    const parsed = CallToolRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: `Invalid request: ${parsed.error.message}` },
        { status: 400 }
      )
    }

    const { serverId, toolName, args } = parsed.data
    const settings = await getSettings()
    const mcpServers = settings.mcpServers ?? []
    const serverConfig = mcpServers.find((s) => s.id === serverId)

    if (!serverConfig) {
      return NextResponse.json(
        { error: `Server ${serverId} not found` },
        { status: 404 }
      )
    }

    if (!serverConfig.enabled) {
      return NextResponse.json(
        { error: `Server ${serverId} is disabled` },
        { status: 400 }
      )
    }

    const config: MCPServerConfig = {
      id: serverConfig.id,
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
    }

    const connection = await connectMCPServer(config)
    const result = await callMCPTool(connection, toolName, args)

    return NextResponse.json({
      serverId,
      toolName,
      result,
      timestamp: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')

    if (!serverId) {
      return NextResponse.json(
        { error: 'serverId query parameter required' },
        { status: 400 }
      )
    }

    const settings = await getSettings()
    const mcpServers = settings.mcpServers ?? []
    const serverConfig = mcpServers.find((s) => s.id === serverId)

    if (!serverConfig) {
      return NextResponse.json(
        { error: `Server ${serverId} not found` },
        { status: 404 }
      )
    }

    const config: MCPServerConfig = {
      id: serverConfig.id,
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
    }

    const connection = await connectMCPServer(config)
    await disconnectMCPServer(connection)

    return NextResponse.json({ success: true, serverId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
