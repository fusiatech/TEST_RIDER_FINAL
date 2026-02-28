const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

export function redactEmails(input: string): string {
  if (!input) return input
  return input.replace(EMAIL_REGEX, '[redacted-email]')
}

