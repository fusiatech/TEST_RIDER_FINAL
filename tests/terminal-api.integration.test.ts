import { describe, it, expect, afterEach } from 'vitest'
import { setTimeout as delay } from 'node:timers/promises'
import { NextRequest } from 'next/server'

import * as rootRoute from '@/app/api/terminal/route'
import * as sessionRoute from '@/app/api/terminal/[id]/route'
import * as writeRoute from '@/app/api/terminal/[id]/write/route'
import * as resizeRoute from '@/app/api/terminal/[id]/resize/route'
import * as terminateRoute from '@/app/api/terminal/[id]/terminate/route'
import { __resetTerminalSessionsForTests } from '@/server/terminal-manager'

// Note: These tests require node-pty which may not be available in all environments
// Skip if terminal manager is not available
describe.skip('Terminal API Integration', () => {
  afterEach(() => {
    __resetTerminalSessionsForTests()
  })

  it('terminal API lifecycle: create/list/write/resize/terminate', async () => {

    const createReq = new NextRequest('http://localhost/api/terminal', {
      method: 'POST',
      body: JSON.stringify({ cols: 80, rows: 24 }),
    })

    const createRes = await rootRoute.POST(createReq)
    expect(createRes.status).toBe(201)
    const createBody = await createRes.json() as { session: { id: string } }
    const sessionId = createBody.session.id
    expect(sessionId).toBeDefined()

    const listRes = await rootRoute.GET()
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json() as { sessions: Array<{ id: string }> }
    expect(listBody.sessions.some((session) => session.id === sessionId)).toBe(true)

    const writeReq = new NextRequest(`http://localhost/api/terminal/${sessionId}/write`, {
      method: 'POST',
      body: JSON.stringify({ input: 'echo terminal_test_ok\n' }),
    })
    const writeRes = await writeRoute.POST(writeReq, { params: Promise.resolve({ id: sessionId }) })
    expect(writeRes.status).toBe(200)

    await delay(250)

    const getRes = await sessionRoute.GET(new Request(`http://localhost/api/terminal/${sessionId}`), {
      params: Promise.resolve({ id: sessionId }),
    })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json() as { session: { scrollback: string } }
    expect(getBody.session.scrollback).toMatch(/terminal_test_ok/)

    const resizeReq = new NextRequest(`http://localhost/api/terminal/${sessionId}/resize`, {
      method: 'POST',
      body: JSON.stringify({ cols: 100, rows: 30 }),
    })
    const resizeRes = await resizeRoute.POST(resizeReq, { params: Promise.resolve({ id: sessionId }) })
    expect(resizeRes.status).toBe(200)

    const blockedReq = new NextRequest(`http://localhost/api/terminal/${sessionId}/write`, {
      method: 'POST',
      body: JSON.stringify({ input: 'sudo ls\n' }),
    })
    const blockedRes = await writeRoute.POST(blockedReq, { params: Promise.resolve({ id: sessionId }) })
    expect(blockedRes.status).toBe(400)

    const terminateRes = await terminateRoute.POST(new Request(`http://localhost/api/terminal/${sessionId}/terminate`, {
      method: 'POST',
    }), { params: Promise.resolve({ id: sessionId }) })
    expect(terminateRes.status).toBe(200)
  })

  it('terminal session reconnect returns retained scrollback', async () => {
    const createRes = await rootRoute.POST(new NextRequest('http://localhost/api/terminal', {
      method: 'POST',
      body: JSON.stringify({ cols: 80, rows: 20 }),
    }))
    const { session } = await createRes.json() as { session: { id: string } }

    await writeRoute.POST(new NextRequest(`http://localhost/api/terminal/${session.id}/write`, {
      method: 'POST',
      body: JSON.stringify({ input: 'echo reconnect_round_one\n' }),
    }), { params: Promise.resolve({ id: session.id }) })

    await delay(200)
    const firstRead = await sessionRoute.GET(new Request(`http://localhost/api/terminal/${session.id}`), {
      params: Promise.resolve({ id: session.id }),
    })
    const firstBody = await firstRead.json() as { session: { scrollback: string } }
    expect(firstBody.session.scrollback).toMatch(/reconnect_round_one/)

    await writeRoute.POST(new NextRequest(`http://localhost/api/terminal/${session.id}/write`, {
      method: 'POST',
      body: JSON.stringify({ input: 'echo reconnect_round_two\n' }),
    }), { params: Promise.resolve({ id: session.id }) })

    await delay(200)
    const secondRead = await sessionRoute.GET(new Request(`http://localhost/api/terminal/${session.id}`), {
      params: Promise.resolve({ id: session.id }),
    })
    const secondBody = await secondRead.json() as { session: { scrollback: string } }
    expect(secondBody.session.scrollback).toMatch(/reconnect_round_one/)
    expect(secondBody.session.scrollback).toMatch(/reconnect_round_two/)
  })
})
