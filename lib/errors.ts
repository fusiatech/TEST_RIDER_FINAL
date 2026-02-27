/**
 * Structured Error Types for SwarmUI
 * GAP-038: Provides typed errors with recovery strategies
 */

export type ErrorCategory = 'validation' | 'network' | 'timeout' | 'auth' | 'resource' | 'internal'

export interface ErrorContext {
  [key: string]: unknown
}

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'skip' | 'abort' | 'escalate'
  maxRetries?: number
  retryDelayMs?: number
  fallbackValue?: unknown
  message: string
}

export class SwarmError extends Error {
  readonly code: string
  readonly category: ErrorCategory
  readonly recoverable: boolean
  readonly retryable: boolean
  readonly context: ErrorContext
  readonly timestamp: number
  readonly recovery?: RecoveryStrategy

  constructor(
    message: string,
    options: {
      code: string
      category: ErrorCategory
      recoverable?: boolean
      retryable?: boolean
      context?: ErrorContext
      recovery?: RecoveryStrategy
      cause?: Error
    }
  ) {
    super(message, { cause: options.cause })
    this.name = 'SwarmError'
    this.code = options.code
    this.category = options.category
    this.recoverable = options.recoverable ?? false
    this.retryable = options.retryable ?? false
    this.context = options.context ?? {}
    this.timestamp = Date.now()
    this.recovery = options.recovery

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      recoverable: this.recoverable,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp,
      recovery: this.recovery,
      stack: this.stack,
    }
  }
}

export class ValidationError extends SwarmError {
  readonly field?: string
  readonly value?: unknown

  constructor(
    message: string,
    options: {
      code?: string
      field?: string
      value?: unknown
      context?: ErrorContext
      cause?: Error
    } = {}
  ) {
    super(message, {
      code: options.code ?? 'VALIDATION_ERROR',
      category: 'validation',
      recoverable: true,
      retryable: false,
      context: {
        ...options.context,
        field: options.field,
        value: options.value,
      },
      recovery: {
        type: 'abort',
        message: 'Fix the validation error and retry',
      },
      cause: options.cause,
    })
    this.name = 'ValidationError'
    this.field = options.field
    this.value = options.value
  }
}

export class NetworkError extends SwarmError {
  readonly url?: string
  readonly statusCode?: number

  constructor(
    message: string,
    options: {
      code?: string
      url?: string
      statusCode?: number
      context?: ErrorContext
      cause?: Error
    } = {}
  ) {
    super(message, {
      code: options.code ?? 'NETWORK_ERROR',
      category: 'network',
      recoverable: true,
      retryable: true,
      context: {
        ...options.context,
        url: options.url,
        statusCode: options.statusCode,
      },
      recovery: {
        type: 'retry',
        maxRetries: 3,
        retryDelayMs: 1000,
        message: 'Retry the network request with exponential backoff',
      },
      cause: options.cause,
    })
    this.name = 'NetworkError'
    this.url = options.url
    this.statusCode = options.statusCode
  }
}

export class TimeoutError extends SwarmError {
  readonly timeoutMs: number
  readonly operation?: string

  constructor(
    message: string,
    options: {
      code?: string
      timeoutMs: number
      operation?: string
      context?: ErrorContext
      cause?: Error
    }
  ) {
    super(message, {
      code: options.code ?? 'TIMEOUT_ERROR',
      category: 'timeout',
      recoverable: true,
      retryable: true,
      context: {
        ...options.context,
        timeoutMs: options.timeoutMs,
        operation: options.operation,
      },
      recovery: {
        type: 'retry',
        maxRetries: 2,
        retryDelayMs: 2000,
        message: 'Retry with increased timeout or reduced workload',
      },
      cause: options.cause,
    })
    this.name = 'TimeoutError'
    this.timeoutMs = options.timeoutMs
    this.operation = options.operation
  }
}

export class AuthError extends SwarmError {
  readonly provider?: string
  readonly requiredScopes?: string[]

  constructor(
    message: string,
    options: {
      code?: string
      provider?: string
      requiredScopes?: string[]
      context?: ErrorContext
      cause?: Error
    } = {}
  ) {
    super(message, {
      code: options.code ?? 'AUTH_ERROR',
      category: 'auth',
      recoverable: true,
      retryable: false,
      context: {
        ...options.context,
        provider: options.provider,
        requiredScopes: options.requiredScopes,
      },
      recovery: {
        type: 'abort',
        message: 'Re-authenticate with the required credentials/scopes',
      },
      cause: options.cause,
    })
    this.name = 'AuthError'
    this.provider = options.provider
    this.requiredScopes = options.requiredScopes
  }
}

export class ResourceError extends SwarmError {
  readonly resourceType?: string
  readonly resourceId?: string

  constructor(
    message: string,
    options: {
      code?: string
      resourceType?: string
      resourceId?: string
      context?: ErrorContext
      cause?: Error
    } = {}
  ) {
    super(message, {
      code: options.code ?? 'RESOURCE_ERROR',
      category: 'resource',
      recoverable: true,
      retryable: false,
      context: {
        ...options.context,
        resourceType: options.resourceType,
        resourceId: options.resourceId,
      },
      recovery: {
        type: 'abort',
        message: 'Verify the resource exists and you have access',
      },
      cause: options.cause,
    })
    this.name = 'ResourceError'
    this.resourceType = options.resourceType
    this.resourceId = options.resourceId
  }
}

export class InternalError extends SwarmError {
  constructor(
    message: string,
    options: {
      code?: string
      context?: ErrorContext
      cause?: Error
    } = {}
  ) {
    super(message, {
      code: options.code ?? 'INTERNAL_ERROR',
      category: 'internal',
      recoverable: false,
      retryable: false,
      context: options.context ?? {},
      recovery: {
        type: 'escalate',
        message: 'Report this error to the development team',
      },
      cause: options.cause,
    })
    this.name = 'InternalError'
  }
}

export function isSwarmError(error: unknown): error is SwarmError {
  return error instanceof SwarmError
}

export function wrapError(error: unknown, context?: ErrorContext): SwarmError {
  if (isSwarmError(error)) {
    if (context) {
      return new SwarmError(error.message, {
        code: error.code,
        category: error.category,
        recoverable: error.recoverable,
        retryable: error.retryable,
        context: { ...error.context, ...context },
        recovery: error.recovery,
        cause: error,
      })
    }
    return error
  }

  const message = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error ? error : undefined

  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('fetch')) {
    return new NetworkError(message, { context, cause })
  }

  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return new TimeoutError(message, { timeoutMs: 0, context, cause })
  }

  if (message.includes('unauthorized') || message.includes('authentication') || message.includes('401')) {
    return new AuthError(message, { context, cause })
  }

  if (message.includes('not found') || message.includes('404') || message.includes('ENOENT')) {
    return new ResourceError(message, { context, cause })
  }

  if (message.includes('validation') || message.includes('invalid')) {
    return new ValidationError(message, { context, cause })
  }

  return new InternalError(message, { context, cause })
}

export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: {
    context?: ErrorContext
    onError?: (error: SwarmError) => void
    rethrow?: boolean
  }
): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    const swarmError = wrapError(error, options?.context)
    options?.onError?.(swarmError)
    if (options?.rethrow !== false) {
      throw swarmError
    }
    return null
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelayMs?: number
    backoffMultiplier?: number
    shouldRetry?: (error: SwarmError, attempt: number) => boolean
    onRetry?: (error: SwarmError, attempt: number) => void
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const retryDelayMs = options.retryDelayMs ?? 1000
  const backoffMultiplier = options.backoffMultiplier ?? 2

  let lastError: SwarmError | null = null

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = wrapError(error)

      if (attempt > maxRetries) {
        throw lastError
      }

      if (!lastError.retryable) {
        throw lastError
      }

      if (options.shouldRetry && !options.shouldRetry(lastError, attempt)) {
        throw lastError
      }

      options.onRetry?.(lastError, attempt)

      const delay = retryDelayMs * Math.pow(backoffMultiplier, attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError ?? new InternalError('Retry loop exited unexpectedly')
}
