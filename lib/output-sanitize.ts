const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
// eslint-disable-next-line no-control-regex
const CONTROL_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const MOJIBAKE_REGEX = /[�]{2,}/g

const NOISE_PATTERNS: RegExp[] = [
  /Warning:\s*'[^']+'\s+is not in the list of known options/i,
  /WindowsPowerShell\\v1\.0\\powershell\.exe/i,
  /Execution_Policies/i,
  /profile\.ps1/i,
]

export function sanitizeOutputText(input: string): string {
  if (!input) return ''
  return input
    .replace(ANSI_REGEX, '')
    .replace(CONTROL_REGEX, '')
    .replace(MOJIBAKE_REGEX, '')
    // Keep formatting mostly intact but collapse pathological gaps left by mojibake stripping.
    .replace(/ {3,}/g, '  ')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function looksLikeTerminalNoise(input: string): boolean {
  if (!input) return true
  return NOISE_PATTERNS.some((pattern) => pattern.test(input))
}

export function isOutputQualityAcceptable(input: string): boolean {
  const sanitized = sanitizeOutputText(input)
  if (!sanitized) return false
  if (sanitized.length < 8) return false
  if (looksLikeTerminalNoise(sanitized) && sanitized.length < 120) return false
  return true
}
