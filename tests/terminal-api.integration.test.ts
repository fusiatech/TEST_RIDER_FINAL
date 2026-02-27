import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { NextRequest } from 'next/server'

import * as rootRoute from '@/app/api/terminal/route'
import * as sessionRoute from '@/app/api/terminal/[id]/route'
import * as writeRoute from '@/app/api/terminal/[id]/write/route'
import * as resizeRoute from '@/app/api/terminal/[id]/resize/route'
import * as terminateRoute from '@/app/api/terminal/[id]/terminate/route'
import { __resetTerminalSessionsForTests } from '@/server/terminal-manager'

test('terminal API lifecycle: create/list/write/resize/terminate', async (t) => {
  t.after(() => {
    __resetTerminalSessionsForTests()
  })

  const createReq = new NextRequest('http://localhost/api/terminal', {
    method: 'POST',
    body: JSON.stringify({ cols: 80, rows: 24 }),
  })

  const createRes = await rootRoute.POST(createReq)
  assert.equal(createRes.status, 201)
  const createBody = await createRes.json() as { session: { id: string } }
  const sessionId = createBody.session.id
  assert.ok(sessionId)

  const listRes = await rootRoute.GET()
  assert.equal(listRes.status, 200)
  const listBody = await listRes.json() as { sessions: Array<{ id: string }> }
  assert.ok(listBody.sessions.some((session) => session.id === sessionId))

  const writeReq = new NextRequest(`http://localhost/api/terminal/${sessionId}/write`, {
    method: 'POST',
    body: JSON.stringify({ input: 'echo terminal_test_ok\n' }),
  })
  const writeRes = await writeRoute.POST(writeReq, { params: Promise.resolve({ id: sessionId }) })
  assert.equal(writeRes.status, 200)

  await delay(250)

  const getRes = await sessionRoute.GET(new Request(`http://localhost/api/terminal/${sessionId}`), {
    params: Promise.resolve({ id: sessionId }),
  })
  assert.equal(getRes.status, 200)
  const getBody = await getRes.json() as { session: { scrollback: string } }
  assert.match(getBody.session.scrollback, /terminal_test_ok/)

  const resizeReq = new NextRequest(`http://localhost/api/terminal/${sessionId}/resize`, {
    method: 'POST',
    body: JSON.stringify({ cols: 100, rows: 30 }),
  })
  const resizeRes = await resizeRoute.POST(resizeReq, { params: Promise.resolve({ id: sessionId }) })
  assert.equal(resizeRes.status, 200)

  const blockedReq = new NextRequest(`http://localhost/api/terminal/${sessionId}/write`, {
    method: 'POST',
    body: JSON.stringify({ input: 'sudo ls\n' }),
  })
  const blockedRes = await writeRoute.POST(blockedReq, { params: Promise.resolve({ id: sessionId }) })
  assert.equal(blockedRes.status, 400)

  const terminateRes = await terminateRoute.POST(new Request(`http://localhost/api/terminal/${sessionId}/terminate`, {
    method: 'POST',
  }), { params: Promise.resolve({ id: sessionId }) })
  assert.equal(terminateRes.status, 200)
})


test('terminal session reconnect returns retained scrollback', async (t) => {
  t.after(() => {
    __resetTerminalSessionsForTests()
  })

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
  assert.match(firstBody.session.scrollback, /reconnect_round_one/)

  await writeRoute.POST(new NextRequest(`http://localhost/api/terminal/${session.id}/write`, {
    method: 'POST',
    body: JSON.stringify({ input: 'echo reconnect_round_two\n' }),
  }), { params: Promise.resolve({ id: session.id }) })

  await delay(200)
  const secondRead = await sessionRoute.GET(new Request(`http://localhost/api/terminal/${session.id}`), {
    params: Promise.resolve({ id: session.id }),
  })
  const secondBody = await secondRead.json() as { session: { scrollback: string } }
  assert.match(secondBody.session.scrollback, /reconnect_round_one/)
  assert.match(secondBody.session.scrollback, /reconnect_round_two/)
})
