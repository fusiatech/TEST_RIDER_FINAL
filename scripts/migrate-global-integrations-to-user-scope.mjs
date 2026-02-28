import fs from 'node:fs'
import path from 'node:path'

const DB_PATH = path.join(process.cwd(), 'db.json')

function now() {
  return Date.now()
}

if (!fs.existsSync(DB_PATH)) {
  console.error('db.json not found')
  process.exit(1)
}

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
db.userProfiles = db.userProfiles || {}
db.integrationConnections = db.integrationConnections || []

const users = Array.isArray(db.users) ? db.users : []
const figmaToken = db.settings?.figmaConfig?.accessToken
const figmaTeamId = db.settings?.figmaConfig?.teamId
const mcpServers = Array.isArray(db.settings?.mcpServers) ? db.settings.mcpServers : []

for (const user of users) {
  if (!user?.id) continue
  db.userProfiles[user.id] = db.userProfiles[user.id] || {
    userId: user.id,
    tenantId: user.tenantId,
    activePlan: 'free',
    billingStatus: 'inactive',
    providerVisibility: {},
    entitlementVersion: 0,
    createdAt: now(),
    updatedAt: now(),
  }

  if (figmaToken) {
    const existing = db.integrationConnections.find((conn) => conn.userId === user.id && conn.provider === 'figma')
    if (!existing) {
      db.integrationConnections.push({
        id: `${user.id}-figma`,
        userId: user.id,
        provider: 'figma',
        status: 'connected',
        scopes: ['file:read'],
        metadata: { teamId: figmaTeamId, migratedFromGlobalSettings: true },
        credentials: { accessToken: figmaToken },
        createdAt: now(),
        updatedAt: now(),
      })
    }
  }

  for (const server of mcpServers) {
    const existing = db.integrationConnections.find(
      (conn) => conn.userId === user.id && conn.provider === 'mcp' && conn.externalId === server.id
    )
    if (!existing) {
      db.integrationConnections.push({
        id: `${user.id}-mcp-${server.id}`,
        userId: user.id,
        provider: 'mcp',
        externalId: server.id,
        status: server.enabled ? 'connected' : 'disconnected',
        displayName: server.name,
        metadata: {
          command: server.command,
          args: server.args,
          migratedFromGlobalSettings: true,
        },
        credentials: server.env,
        scopes: [],
        createdAt: now(),
        updatedAt: now(),
      })
    }
  }
}

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
console.log(`Migrated ${users.length} user profiles and integration fallbacks.`)
