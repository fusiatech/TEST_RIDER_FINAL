import { NextRequest, NextResponse } from 'next/server'
import { auditIntegrationConnect, auditIntegrationDisconnect } from '@/lib/audit'
import { requireFeature } from '@/server/feature-flags'
import { badRequest, featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import {
  deleteUserManagedMCPServer,
  listUserManagedMCPServers,
  upsertUserManagedMCPServer,
} from '@/server/integrations/mcp-service'

function redactServerSecrets<T extends { env: Record<string, string> }>(server: T): T {
  return {
    ...server,
    env: Object.fromEntries(Object.keys(server.env).map((key) => [key, '********'])),
  }
}

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('MCP_MANAGED_SERVERS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const servers = (await listUserManagedMCPServers(authResult.user.id)).map(redactServerSecrets)
  return NextResponse.json({ servers })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('MCP_MANAGED_SERVERS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const payload = await request.json().catch(() => null)
  if (!payload) return badRequest('Invalid JSON payload')

  try {
    const server = await upsertUserManagedMCPServer(authResult.user.id, payload)
    await auditIntegrationConnect('mcp', {
      userId: authResult.user.id,
      serverId: server.id,
      name: server.name,
    })
    return NextResponse.json({ server: redactServerSecrets(server) }, { status: 201 })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Failed to create MCP server')
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('MCP_MANAGED_SERVERS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const payload = await request.json().catch(() => null)
  if (!payload) return badRequest('Invalid JSON payload')

  try {
    const server = await upsertUserManagedMCPServer(authResult.user.id, payload)
    return NextResponse.json({ server: redactServerSecrets(server) })
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Failed to update MCP server')
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const gate = requireFeature('MCP_MANAGED_SERVERS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return badRequest('Missing id query parameter')

  const deleted = await deleteUserManagedMCPServer(authResult.user.id, id)
  if (deleted) {
    await auditIntegrationDisconnect('mcp', {
      userId: authResult.user.id,
      serverId: id,
    })
  }

  return NextResponse.json({ ok: deleted })
}
