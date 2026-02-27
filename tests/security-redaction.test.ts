import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { runSecurityChecks } from '@/server/security-checks'
import { redactSensitiveOutput } from '@/server/logger'
import { truncateCliExcerpt } from '@/server/evidence'

test('security checks fail on high-confidence seeded secrets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'secret-scan-'))
  try {
    writeFileSync(
      join(root, 'index.ts'),
      `const apiKey = "sk-test-1234567890ABCDEFGHIJKLMNO"\nconst pass = true\n`,
      'utf8',
    )

    const result = await runSecurityChecks(root, {
      typescript: false,
      eslint: false,
      npmAudit: false,
    })

    assert.equal(result.passed, false)
    assert.ok(result.secretScan)
    assert.ok((result.secretScan?.highConfidenceCount ?? 0) > 0)
    const secretCheck = result.checks.find((c) => c.name.includes('Secrets scan'))
    assert.ok(secretCheck)
    assert.equal(secretCheck?.passed, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('logger redaction snapshot strips token-like values', () => {
  const input = 'token=ghp_abcdefghijklmnopqrstuvwxyz123456 and password: supersecretvalue123'
  const redacted = redactSensitiveOutput(input)

  assert.equal(
    redacted,
    'token=[REDACTED_SECRET] and [REDACTED_SECRET]',
  )
})

test('evidence excerpt truncation redacts seeded secret', () => {
  const excerpt = truncateCliExcerpt('output=> sk-test-1234567890ABCDEFGHIJKLMNO done')
  assert.equal(excerpt, 'output=> [REDACTED_SECRET] done')
})
