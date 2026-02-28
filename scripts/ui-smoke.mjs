#!/usr/bin/env node

const baseUrl = process.env.UI_SMOKE_BASE_URL || 'http://localhost:3000'
const routes = ['/login', '/app', '/app?tab=chat', '/app?tab=observability', '/settings']

async function checkRoute(route) {
  const url = `${baseUrl}${route}`
  const start = Date.now()
  const response = await fetch(url, { redirect: 'manual' })
  const duration = Date.now() - start
  return { route, status: response.status, ok: response.status < 500, duration }
}

try {
  const results = []
  for (const route of routes) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await checkRoute(route))
  }

  let failed = false
  for (const result of results) {
    const symbol = result.ok ? 'PASS' : 'FAIL'
    console.log(`${symbol} ${result.route} -> ${result.status} (${result.duration}ms)`)
    if (!result.ok) failed = true
  }

  if (failed) {
    process.exit(1)
  }

  console.log('UI smoke passed.')
} catch (error) {
  console.error(`UI smoke failed to run against ${baseUrl}. Is the dev server running?`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
}
