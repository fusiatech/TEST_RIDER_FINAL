import crypto from 'node:crypto'
import { z } from 'zod'
import type { ManagedMCPServer } from '@/lib/contracts/backend'
import { ManagedMCPServerSchema } from '@/lib/contracts/backend'
import { getSettings } from '@/server/storage'
import { deleteManagedMCPServer, listManagedMCPServers, upsertManagedMCPServer } from '@/server/integrations/store'

const ServerInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  command: z.string().min(1).max(500),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
  policy: z.object({
    allowedTransports: z.array(z.enum(['stdio', 'sse', 'http'])).default(['stdio']),
    commandAllowlist: z.array(z.string()).default([]),
    hostAllowlist: z.array(z.string()).default([]),
    toolAllowlist: z.array(z.string()).default([]),
    requireApproval: z.boolean().default(false),
    timeoutMs: z.number().min(1000).max(300000).default(30000),
  }).default({}),
})

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(key)) continue
    if (value.length > 2048) continue
    sanitized[key] = value
  }
  return sanitized
}

export function validateMCPCommandAgainstPolicy(command: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true
  return allowlist.some((allowed) => command === allowed || command.startsWith(`${allowed} `))
}

export async function listUserManagedMCPServers(userId: string): Promise<ManagedMCPServer[]> {
  return listManagedMCPServers(userId)
}

export async function upsertUserManagedMCPServer(userId: string, input: unknown): Promise<ManagedMCPServer> {
  const parsed = ServerInputSchema.parse(input)

  if (!validateMCPCommandAgainstPolicy(parsed.command, parsed.policy.commandAllowlist)) {
    throw new Error('Command is not permitted by commandAllowlist policy')
  }

  const now = Date.now()
  const server: ManagedMCPServer = ManagedMCPServerSchema.parse({
    id: parsed.id ?? crypto.randomUUID(),
    userId,
    name: parsed.name,
    command: parsed.command,
    args: parsed.args,
    env: sanitizeEnv(parsed.env),
    enabled: parsed.enabled,
    policy: parsed.policy,
    createdAt: now,
    updatedAt: now,
  })

  return upsertManagedMCPServer(server)
}

export async function deleteUserManagedMCPServer(userId: string, id: string): Promise<boolean> {
  return deleteManagedMCPServer(userId, id)
}

export async function getEffectiveMCPServersForUser(userId?: string): Promise<Array<{
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  policy?: ManagedMCPServer['policy']
}>> {
  if (userId) {
    const managed = await listManagedMCPServers(userId)
    if (managed.length > 0) {
      return managed.map((server) => ({
        id: server.id,
        name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
        enabled: server.enabled,
        policy: server.policy,
      }))
    }
  }

  // Backward compatibility fallback to legacy global settings.
  const settings = await getSettings()
  return (settings.mcpServers ?? []).map((server) => ({
    id: server.id,
    name: server.name,
        command: server.command,
        args: server.args,
        env: server.env,
        enabled: server.enabled,
        policy: undefined,
      }))
}

export function getMCPServerTemplates(): Array<{
  id: string
  name: string
  description: string
  command: string
  args: string[]
  policy: ManagedMCPServer['policy']
}> {
  return [
    {
      id: 'template-github-mcp',
      name: 'GitHub MCP Server',
      description: 'Official GitHub MCP server template',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      policy: {
        allowedTransports: ['stdio'],
        commandAllowlist: ['npx', 'node'],
        hostAllowlist: ['api.github.com'],
        toolAllowlist: [],
        requireApproval: true,
        timeoutMs: 30000,
      },
    },
    {
      id: 'template-figma-mcp',
      name: 'Figma Dev Mode MCP',
      description: 'Figma Dev Mode MCP server template',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-figma'],
      policy: {
        allowedTransports: ['stdio'],
        commandAllowlist: ['npx', 'node'],
        hostAllowlist: ['api.figma.com'],
        toolAllowlist: [],
        requireApproval: true,
        timeoutMs: 30000,
      },
    },
    {
      id: 'template-filesystem-readonly',
      name: 'Filesystem MCP (Read-only)',
      description: 'Filesystem MCP server with strict allowlist defaults',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '--readonly'],
      policy: {
        allowedTransports: ['stdio'],
        commandAllowlist: ['npx', 'node'],
        hostAllowlist: [],
        toolAllowlist: ['read_file', 'list_directory', 'search_files'],
        requireApproval: false,
        timeoutMs: 20000,
      },
    },
    {
      id: 'template-slack-mcp',
      name: 'Slack MCP Template',
      description: 'Template for Slack MCP-compatible integrations',
      command: 'npx',
      args: ['-y', 'slack-mcp-server'],
      policy: {
        allowedTransports: ['stdio'],
        commandAllowlist: ['npx', 'node'],
        hostAllowlist: ['slack.com'],
        toolAllowlist: [],
        requireApproval: true,
        timeoutMs: 30000,
      },
    },
  ]
}
