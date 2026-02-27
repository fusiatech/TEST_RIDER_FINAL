/**
 * Utility for announcing messages to screen readers via aria-live region.
 * Gap ID: G-A11Y-03 (Screen Reader Support)
 */

/**
 * Announces a message to screen readers by updating the aria-live region.
 * @param message - The message to announce
 * @param priority - 'polite' (default) waits for idle, 'assertive' interrupts
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const el = document.getElementById('announcer')
  if (el) {
    el.setAttribute('aria-live', priority)
    el.textContent = ''
    requestAnimationFrame(() => {
      el.textContent = message
    })
  }
}

/**
 * Announces a job status change to screen readers.
 */
export function announceJobStatus(jobId: string, status: string) {
  announce(`Job ${jobId.slice(0, 8)} status: ${status}`)
}

/**
 * Announces a form validation error to screen readers.
 */
export function announceError(message: string) {
  announce(message, 'assertive')
}

/**
 * Announces a loading state change to screen readers.
 */
export function announceLoading(isLoading: boolean, context?: string) {
  if (isLoading) {
    announce(`Loading${context ? ` ${context}` : ''}...`)
  } else {
    announce(`${context ? `${context} ` : ''}Loaded`)
  }
}
