import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getAllFingerprints,
  getFingerprint,
  recordError,
  linkErrorToTicket,
  unlinkErrorFromTicket,
  getStatistics,
  getErrorTrends,
  getErrorsByFingerprint,
  getFingerprintsReadyForTicket,
  createBugTicket,
  getConfig,
  updateConfig,
  clearOldFingerprints,
  type RawError,
  type ErrorToTicketConfig,
} from '@/server/error-to-ticket'
import { getProject, saveProject } from '@/server/storage'

const ReportErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  component: z.string().optional(),
  source: z.enum(['error-boundary', 'logger', 'test-failure', 'ci-cd', 'api', 'unknown']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const LinkTicketSchema = z.object({
  fingerprintHash: z.string(),
  ticketId: z.string(),
})

const CreateTicketSchema = z.object({
  fingerprintHash: z.string(),
  projectId: z.string(),
})

const UpdateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  minOccurrences: z.number().min(1).optional(),
  deduplicationWindowMs: z.number().min(60000).optional(),
  autoAssign: z.boolean().optional(),
  defaultPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  autoCreateTicket: z.boolean().optional(),
  notifyOnNewError: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const hash = searchParams.get('hash')
  const hours = parseInt(searchParams.get('hours') || '24', 10)

  try {
    switch (action) {
      case 'statistics':
        return NextResponse.json(getStatistics())

      case 'trends':
        return NextResponse.json(getErrorTrends(hours))

      case 'ready-for-ticket':
        return NextResponse.json(getFingerprintsReadyForTicket())

      case 'occurrences':
        if (!hash) {
          return NextResponse.json({ error: 'hash parameter required' }, { status: 400 })
        }
        return NextResponse.json(getErrorsByFingerprint(hash))

      case 'fingerprint':
        if (!hash) {
          return NextResponse.json({ error: 'hash parameter required' }, { status: 400 })
        }
        const fp = getFingerprint(hash)
        if (!fp) {
          return NextResponse.json({ error: 'Fingerprint not found' }, { status: 404 })
        }
        return NextResponse.json(fp)

      case 'config':
        return NextResponse.json(getConfig())

      default:
        return NextResponse.json({
          fingerprints: getAllFingerprints(),
          statistics: getStatistics(),
        })
    }
  } catch (error) {
    console.error('[errors/route] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const body = await request.json()

    switch (action) {
      case 'create-ticket': {
        const parsed = CreateTicketSchema.safeParse(body)
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.message }, { status: 400 })
        }

        const { fingerprintHash, projectId } = parsed.data
        const fp = getFingerprint(fingerprintHash)
        if (!fp) {
          return NextResponse.json({ error: 'Fingerprint not found' }, { status: 404 })
        }

        if (fp.ticketId) {
          return NextResponse.json({ error: 'Fingerprint already linked to a ticket' }, { status: 400 })
        }

        const project = await getProject(projectId)
        if (!project) {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        }

        const ticket = await createBugTicket(fp, projectId)
        project.tickets.push(ticket)
        project.updatedAt = Date.now()
        await saveProject(project)

        return NextResponse.json({ ticket, fingerprint: fp }, { status: 201 })
      }

      case 'cleanup': {
        const maxAgeMs = body.maxAgeMs || 7 * 24 * 60 * 60 * 1000
        const cleared = clearOldFingerprints(maxAgeMs)
        return NextResponse.json({ cleared })
      }

      default: {
        const parsed = ReportErrorSchema.safeParse(body)
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.message }, { status: 400 })
        }

        const rawError: RawError = parsed.data
        const result = recordError(rawError)

        return NextResponse.json(
          {
            fingerprint: result.fingerprint,
            occurrence: result.occurrence,
            shouldCreateTicket: getFingerprintsReadyForTicket().some(
              (fp) => fp.hash === result.fingerprint.hash
            ),
          },
          { status: 201 }
        )
      }
    }
  } catch (error) {
    console.error('[errors/route] POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  try {
    const body = await request.json()

    switch (action) {
      case 'link': {
        const parsed = LinkTicketSchema.safeParse(body)
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.message }, { status: 400 })
        }

        const { fingerprintHash, ticketId } = parsed.data
        const fp = linkErrorToTicket(fingerprintHash, ticketId)
        if (!fp) {
          return NextResponse.json({ error: 'Fingerprint not found' }, { status: 404 })
        }

        return NextResponse.json(fp)
      }

      case 'unlink': {
        const { fingerprintHash } = body
        if (!fingerprintHash) {
          return NextResponse.json({ error: 'fingerprintHash required' }, { status: 400 })
        }

        const fp = unlinkErrorFromTicket(fingerprintHash)
        if (!fp) {
          return NextResponse.json({ error: 'Fingerprint not found' }, { status: 404 })
        }

        return NextResponse.json(fp)
      }

      case 'config': {
        const parsed = UpdateConfigSchema.safeParse(body)
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.message }, { status: 400 })
        }

        const config = updateConfig(parsed.data as Partial<ErrorToTicketConfig>)
        return NextResponse.json(config)
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('[errors/route] PUT error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
