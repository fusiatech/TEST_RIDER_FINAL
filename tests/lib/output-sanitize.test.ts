import { describe, expect, it } from 'vitest'
import { isOutputQualityAcceptable, sanitizeOutputText } from '@/lib/output-sanitize'

describe('output sanitization', () => {
  it('strips ANSI escape codes and control characters', () => {
    const raw = '\u001b[2J\u001b[0mHello\u0007 World'
    expect(sanitizeOutputText(raw)).toBe('Hello World')
  })

  it('removes mojibake replacement runs', () => {
    const raw = 'Result �� �� text'
    expect(sanitizeOutputText(raw)).toBe('Result  text')
  })

  it('rejects terminal-noise dominant outputs', () => {
    const noisy = "Warning: 'p' is not in the list of known options, but still passed to Electron/Chromium."
    expect(isOutputQualityAcceptable(noisy)).toBe(false)
  })
})

