import { NextResponse } from 'next/server'
import { CLI_REGISTRY } from '@/lib/cli-registry'
import { requireFeature } from '@/server/feature-flags'
import { featureDisabledResponse, requireAuthenticatedUser } from '@/server/integrations/http'
import { listIntegrationConnectionsRedacted } from '@/server/integrations/store'

const INTEGRATION_LABELS: Record<string, string> = {
  github: 'GitHub',
  figma: 'Figma',
  mcp: 'MCP',
  slack: 'Slack',
  linear: 'Linear',
  billing: 'Billing',
}

export async function GET(): Promise<NextResponse> {
  const gate = requireFeature('BACKEND_INTEGRATIONS')
  if (!gate.ok) return featureDisabledResponse(gate.message)

  const authResult = await requireAuthenticatedUser()
  if ('response' in authResult) return authResult.response

  const userId = authResult.user.id
  const connections = await listIntegrationConnectionsRedacted(userId)

  const providers = ['github', 'figma', 'mcp', 'slack', 'linear', 'billing'].map((provider) => {
    const entries = connections.filter((entry) => entry.provider === provider)
    return {
      provider,
      label: INTEGRATION_LABELS[provider] ?? provider,
      connected: entries.some((entry) => entry.status === 'connected'),
      status: entries[0]?.status ?? 'disconnected',
      count: entries.length,
      entries,
    }
  })

  return NextResponse.json({
    userId,
    providers,
    runtimeProviders: CLI_REGISTRY.map((cli) => ({
      id: cli.id,
      name: cli.name,
      supportsApi: Boolean(cli.supportsAPI),
    })),
  })
}
