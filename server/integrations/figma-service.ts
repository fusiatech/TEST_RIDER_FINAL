import { getSettings } from '@/server/storage'
import { testFigmaConnection } from '@/server/figma-client'
import { deleteIntegrationConnection, getIntegrationConnection, updateIntegrationStatus } from '@/server/integrations/store'

export async function connectFigmaForUser(userId: string, accessToken: string, teamId?: string): Promise<{ connected: boolean; teamId?: string }> {
  const test = await testFigmaConnection(accessToken)
  if (!test.success) {
    throw new Error(test.message)
  }

  await updateIntegrationStatus(userId, 'figma', 'connected', {
    displayName: 'Figma',
    scopes: ['file:read'],
    metadata: {
      teamId,
      verifiedAt: Date.now(),
    },
    credentials: {
      accessToken,
    },
  })

  return {
    connected: true,
    teamId,
  }
}

export async function getFigmaStatusForUser(userId: string): Promise<Record<string, unknown>> {
  const connection = await getIntegrationConnection(userId, 'figma')
  if (!connection) {
    return { connected: false }
  }

  return {
    connected: connection.status === 'connected',
    status: connection.status,
    teamId: connection.metadata?.teamId,
    lastSyncedAt: connection.lastSyncedAt,
    hasToken: Boolean(connection.credentials?.accessToken),
  }
}

export async function disconnectFigmaForUser(userId: string): Promise<void> {
  await deleteIntegrationConnection(userId, 'figma')
}

export async function getFigmaAccessTokenForUser(userId?: string): Promise<string | null> {
  if (userId) {
    const connection = await getIntegrationConnection(userId, 'figma')
    const token = connection?.credentials?.accessToken
    if (token && token !== '********') {
      return token
    }
  }

  // Backward compatibility: fallback to legacy global settings token.
  const settings = await getSettings()
  return settings.figmaConfig?.accessToken ?? null
}
