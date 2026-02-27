import { NextRequest, NextResponse } from 'next/server'
import { getProject, saveProject, getDb } from '@/server/storage'
import { DevPackSchema, type DevPack, type ApiSpec, type TestCase } from '@/lib/types'
import { z } from 'zod'
import { sanitizeHTML, escapeHTML } from '@/lib/sanitize'

interface DevPacksStore {
  devPacks: Record<string, DevPack[]>
}

async function getDevPacksStore(): Promise<DevPacksStore> {
  const db = await getDb()
  const data = db.data as unknown as { devPacks?: Record<string, DevPack[]> }
  if (!data.devPacks) {
    data.devPacks = {}
  }
  return { devPacks: data.devPacks }
}

async function saveDevPacksStore(projectId: string, devPacks: DevPack[]): Promise<void> {
  const db = await getDb()
  const data = db.data as unknown as { devPacks?: Record<string, DevPack[]> }
  if (!data.devPacks) {
    data.devPacks = {}
  }
  data.devPacks[projectId] = devPacks
  await db.write()
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const store = await getDevPacksStore()
    const devPacks = store.devPacks[id] || []
    return NextResponse.json(devPacks)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const CreateDevPackSchema = z.object({
  ticketId: z.string(),
  prdSectionId: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  generateAI: z.boolean().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const result = CreateDevPackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    const { ticketId, prdSectionId, techStack = [], generateAI } = result.data

    const ticket = project.tickets.find((t) => t.id === ticketId)
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const store = await getDevPacksStore()
    const existingDevPacks = store.devPacks[id] || []

    const existingForTicket = existingDevPacks.find((dp) => dp.ticketId === ticketId)
    if (existingForTicket) {
      return NextResponse.json(
        { error: 'Dev pack already exists for this ticket' },
        { status: 400 }
      )
    }

    const now = Date.now()
    let devPack: DevPack

    if (generateAI) {
      devPack = generateDevPackContent(ticketId, prdSectionId, techStack, ticket, now)
    } else {
      devPack = {
        id: `dp-${now}-${Math.random().toString(36).slice(2, 9)}`,
        ticketId,
        prdSectionId,
        architectureDiagram: '',
        apiSpecs: [],
        databaseSchema: '',
        techStack: techStack.map(escapeHTML),
        dependencies: [],
        implementationNotes: '',
        testPlan: [],
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      }
    }

    await saveDevPacksStore(id, [...existingDevPacks, devPack])
    return NextResponse.json(devPack, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function generateDevPackContent(
  ticketId: string,
  prdSectionId: string | undefined,
  techStack: string[],
  ticket: { title: string; description: string; acceptanceCriteria: string[] },
  now: number
): DevPack {
  const sanitizedTechStack = techStack.map(escapeHTML)
  const hasBackend = techStack.some((t) =>
    ['Node.js', 'Express', 'Next.js', 'REST API', 'GraphQL', 'tRPC'].includes(t)
  )
  const hasDatabase = techStack.some((t) =>
    ['PostgreSQL', 'MongoDB', 'Redis', 'Prisma', 'MySQL', 'SQLite'].includes(t)
  )
  const hasFrontend = techStack.some((t) =>
    ['React', 'Next.js', 'Vue', 'Angular', 'Tailwind CSS'].includes(t)
  )

  const architectureDiagram = generateMermaidDiagram(
    ticket.title,
    hasBackend,
    hasDatabase,
    hasFrontend,
    techStack
  )

  const apiSpecs: ApiSpec[] = hasBackend
    ? generateApiSpecs(ticket.title, ticket.acceptanceCriteria)
    : []

  const databaseSchema = hasDatabase
    ? generateDatabaseSchema(ticket.title, techStack)
    : ''

  const dependencies = generateDependencies(techStack)

  const implementationNotes = generateImplementationNotes(
    ticket.title,
    ticket.description,
    techStack
  )

  const testPlan = generateTestPlan(ticket.title, ticket.acceptanceCriteria, now)

  return {
    id: `dp-${now}-${Math.random().toString(36).slice(2, 9)}`,
    ticketId,
    prdSectionId,
    architectureDiagram,
    apiSpecs,
    databaseSchema,
    techStack: sanitizedTechStack,
    dependencies,
    implementationNotes,
    testPlan,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

function generateMermaidDiagram(
  title: string,
  hasBackend: boolean,
  hasDatabase: boolean,
  hasFrontend: boolean,
  techStack: string[]
): string {
  const lines: string[] = ['graph TB']
  const featureName = title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)

  if (hasFrontend) {
    lines.push(`    subgraph Frontend`)
    lines.push(`        UI[User Interface]`)
    lines.push(`        Components[React Components]`)
    lines.push(`        State[State Management]`)
    lines.push(`        UI --> Components`)
    lines.push(`        Components --> State`)
    lines.push(`    end`)
  }

  if (hasBackend) {
    lines.push(`    subgraph Backend`)
    lines.push(`        API[API Layer]`)
    lines.push(`        Service[${featureName}Service]`)
    lines.push(`        Validation[Input Validation]`)
    lines.push(`        API --> Validation`)
    lines.push(`        Validation --> Service`)
    lines.push(`    end`)
  }

  if (hasDatabase) {
    lines.push(`    subgraph Database`)
    const dbType = techStack.includes('PostgreSQL')
      ? 'PostgreSQL'
      : techStack.includes('MongoDB')
        ? 'MongoDB'
        : 'Database'
    lines.push(`        DB[(${dbType})]`)
    if (techStack.includes('Redis')) {
      lines.push(`        Cache[(Redis Cache)]`)
    }
    lines.push(`    end`)
  }

  if (hasFrontend && hasBackend) {
    lines.push(`    State --> API`)
  }
  if (hasBackend && hasDatabase) {
    lines.push(`    Service --> DB`)
    if (techStack.includes('Redis')) {
      lines.push(`    Service --> Cache`)
    }
  }

  return lines.join('\n')
}

function generateApiSpecs(
  title: string,
  acceptanceCriteria: string[]
): ApiSpec[] {
  const resourceName = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)

  const specs: ApiSpec[] = [
    {
      endpoint: `/api/${resourceName}`,
      method: 'GET',
      description: `List all ${resourceName} items`,
      responseSchema: {
        type: 'array',
        items: { type: 'object' },
      },
    },
    {
      endpoint: `/api/${resourceName}`,
      method: 'POST',
      description: `Create a new ${resourceName} item`,
      requestSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
      responseSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'number' },
        },
      },
    },
    {
      endpoint: `/api/${resourceName}/{id}`,
      method: 'GET',
      description: `Get a single ${resourceName} item by ID`,
      responseSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
    {
      endpoint: `/api/${resourceName}/{id}`,
      method: 'PUT',
      description: `Update a ${resourceName} item`,
      requestSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    {
      endpoint: `/api/${resourceName}/{id}`,
      method: 'DELETE',
      description: `Delete a ${resourceName} item`,
    },
  ]

  return specs
}

function generateDatabaseSchema(title: string, techStack: string[]): string {
  const tableName = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30)

  if (techStack.includes('MongoDB')) {
    return `// MongoDB Collection: ${tableName}
{
  "_id": ObjectId,
  "name": String,
  "description": String,
  "status": String, // "active" | "inactive"
  "metadata": {
    "createdBy": String,
    "tags": [String]
  },
  "createdAt": Date,
  "updatedAt": Date
}

// Indexes
db.${tableName}.createIndex({ "name": 1 })
db.${tableName}.createIndex({ "status": 1 })
db.${tableName}.createIndex({ "createdAt": -1 })`
  }

  return `-- Table: ${tableName}
CREATE TABLE ${tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_${tableName}_name ON ${tableName}(name);
CREATE INDEX idx_${tableName}_status ON ${tableName}(status);
CREATE INDEX idx_${tableName}_created_at ON ${tableName}(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_${tableName}_updated_at
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();`
}

function generateDependencies(techStack: string[]): string[] {
  const deps: string[] = []

  const depMap: Record<string, string[]> = {
    React: ['react@^18.0.0', 'react-dom@^18.0.0'],
    'Next.js': ['next@^15.0.0'],
    TypeScript: ['typescript@^5.0.0', '@types/node@^20.0.0', '@types/react@^18.0.0'],
    'Tailwind CSS': ['tailwindcss@^4.0.0', 'postcss@^8.0.0', 'autoprefixer@^10.0.0'],
    PostgreSQL: ['pg@^8.0.0', '@types/pg@^8.0.0'],
    MongoDB: ['mongodb@^6.0.0'],
    Redis: ['redis@^4.0.0', '@types/redis@^4.0.0'],
    Prisma: ['prisma@^5.0.0', '@prisma/client@^5.0.0'],
    tRPC: ['@trpc/server@^10.0.0', '@trpc/client@^10.0.0', '@trpc/react-query@^10.0.0'],
    Zod: ['zod@^3.0.0'],
    Jest: ['jest@^29.0.0', '@types/jest@^29.0.0', 'ts-jest@^29.0.0'],
    Vitest: ['vitest@^1.0.0', '@vitest/ui@^1.0.0'],
    Playwright: ['@playwright/test@^1.0.0'],
    Cypress: ['cypress@^13.0.0'],
    Express: ['express@^4.0.0', '@types/express@^4.0.0'],
    GraphQL: ['graphql@^16.0.0', '@apollo/server@^4.0.0'],
    Docker: [],
    Kubernetes: [],
    AWS: ['@aws-sdk/client-s3@^3.0.0'],
  }

  for (const tech of techStack) {
    const techDeps = depMap[tech]
    if (techDeps) {
      deps.push(...techDeps)
    }
  }

  return [...new Set(deps)]
}

function generateImplementationNotes(
  title: string,
  description: string,
  techStack: string[]
): string {
  const notes: string[] = [
    `## Implementation Notes for: ${title}`,
    '',
    '### Overview',
    description || 'No description provided.',
    '',
    '### Architecture Decisions',
  ]

  if (techStack.includes('Next.js')) {
    notes.push('- Using Next.js App Router for server-side rendering and API routes')
    notes.push('- Implementing server components where possible for better performance')
  }

  if (techStack.includes('TypeScript')) {
    notes.push('- Strict TypeScript configuration for type safety')
    notes.push('- Using Zod for runtime validation')
  }

  if (techStack.includes('PostgreSQL') || techStack.includes('MongoDB')) {
    notes.push('- Database migrations should be versioned and reversible')
    notes.push('- Implement proper indexing for query optimization')
  }

  if (techStack.includes('Redis')) {
    notes.push('- Use Redis for caching frequently accessed data')
    notes.push('- Implement cache invalidation strategy')
  }

  notes.push('')
  notes.push('### Security Considerations')
  notes.push('- Validate all user inputs')
  notes.push('- Implement proper authentication and authorization')
  notes.push('- Use parameterized queries to prevent SQL injection')
  notes.push('- Sanitize outputs to prevent XSS')

  notes.push('')
  notes.push('### Performance Considerations')
  notes.push('- Implement pagination for list endpoints')
  notes.push('- Use database indexes for frequently queried fields')
  notes.push('- Consider implementing rate limiting')

  return notes.join('\n')
}

function generateTestPlan(
  title: string,
  acceptanceCriteria: string[],
  now: number
): TestCase[] {
  const testCases: TestCase[] = []
  const baseId = now.toString(36)

  testCases.push({
    id: `${baseId}-unit-1`,
    name: `${title} - Unit Tests`,
    description: 'Verify core business logic functions correctly',
    type: 'unit',
    steps: [
      'Set up test fixtures and mocks',
      'Test happy path scenarios',
      'Test edge cases and boundary conditions',
      'Test error handling',
    ],
    expectedResult: 'All unit tests pass with >80% code coverage',
    priority: 'high',
  })

  testCases.push({
    id: `${baseId}-int-1`,
    name: `${title} - Integration Tests`,
    description: 'Verify components work together correctly',
    type: 'integration',
    steps: [
      'Set up test database',
      'Test API endpoints with real database',
      'Test data flow between components',
      'Verify database transactions',
    ],
    expectedResult: 'All integration tests pass',
    priority: 'high',
  })

  testCases.push({
    id: `${baseId}-e2e-1`,
    name: `${title} - E2E Tests`,
    description: 'Verify end-to-end user flows',
    type: 'e2e',
    steps: [
      'Set up test environment',
      'Simulate user interactions',
      'Verify UI updates correctly',
      'Test error states and recovery',
    ],
    expectedResult: 'All E2E tests pass',
    priority: 'medium',
  })

  acceptanceCriteria.forEach((criterion, index) => {
    testCases.push({
      id: `${baseId}-ac-${index + 1}`,
      name: `AC: ${criterion.slice(0, 50)}${criterion.length > 50 ? '...' : ''}`,
      description: criterion,
      type: 'integration',
      steps: ['Implement test for acceptance criterion', 'Verify criterion is met'],
      expectedResult: 'Acceptance criterion is satisfied',
      priority: 'high',
    })
  })

  testCases.push({
    id: `${baseId}-sec-1`,
    name: `${title} - Security Tests`,
    description: 'Verify security requirements are met',
    type: 'security',
    steps: [
      'Test authentication flows',
      'Test authorization rules',
      'Test input validation',
      'Test for common vulnerabilities (XSS, CSRF, SQL injection)',
    ],
    expectedResult: 'No security vulnerabilities found',
    priority: 'high',
  })

  return testCases
}

const UpdateDevPackSchema = z.object({
  architectureDiagram: z.string().optional(),
  apiSpecs: z.array(z.object({
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    requestSchema: z.record(z.unknown()).optional(),
    responseSchema: z.record(z.unknown()).optional(),
    description: z.string().optional(),
  })).optional(),
  databaseSchema: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  implementationNotes: z.string().optional(),
  testPlan: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: z.enum(['unit', 'integration', 'e2e', 'performance', 'security']).optional(),
    steps: z.array(z.string()).optional(),
    expectedResult: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  })).optional(),
  status: z.enum(['draft', 'review', 'approved']).optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body: unknown = await request.json()
    const result = UpdateDevPackSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid request: ${result.error.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Use /api/projects/[id]/dev-packs/[packId] for updates' },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(
      { error: 'Use /api/projects/[id]/dev-packs/[packId] for deletion' },
      { status: 400 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
