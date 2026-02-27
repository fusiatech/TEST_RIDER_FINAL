import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError, ZodSchema } from 'zod'

/**
 * Validation middleware for Next.js API routes
 * BE-014: Consistent input validation across API routes
 */

/**
 * Validation error response format
 */
export interface ValidationErrorResponse {
  error: 'Validation Error'
  message: string
  details: ValidationErrorDetail[]
}

export interface ValidationErrorDetail {
  field: string
  message: string
  code: string
}

/**
 * Format Zod errors into a consistent response format
 */
function formatZodError(error: ZodError): ValidationErrorResponse {
  const details: ValidationErrorDetail[] = error.errors.map((err) => ({
    field: err.path.join('.') || 'body',
    message: err.message,
    code: err.code,
  }))

  return {
    error: 'Validation Error',
    message: `Invalid request: ${details.map((d) => d.message).join(', ')}`,
    details,
  }
}

/**
 * Options for validation middleware
 */
export interface ValidationOptions {
  /** Strip unknown fields from the validated data (default: true) */
  stripUnknown?: boolean
  /** Custom error status code (default: 400) */
  errorStatus?: number
}

/**
 * Validated request context passed to the handler
 */
export interface ValidatedContext<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body: TBody
  query: TQuery
  params: TParams
  request: NextRequest
}

/**
 * Handler function type for validated routes
 */
export type ValidatedHandler<TBody = unknown, TQuery = unknown, TParams = unknown> = (
  ctx: ValidatedContext<TBody, TQuery, TParams>
) => Promise<NextResponse> | NextResponse

/**
 * Schema configuration for validation
 */
export interface ValidationSchemas<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body?: ZodSchema<TBody>
  query?: ZodSchema<TQuery>
  params?: ZodSchema<TParams>
}

/**
 * Parse query parameters from URL search params
 */
function parseQueryParams(searchParams: URLSearchParams): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}
  searchParams.forEach((value, key) => {
    const existing = params[key]
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        params[key] = [existing, value]
      }
    } else {
      params[key] = value
    }
  })
  return params
}

/**
 * Create a validated API route handler
 * 
 * @example
 * ```ts
 * import { withValidation } from '@/lib/validation-middleware'
 * import { z } from 'zod'
 * 
 * const CreateProjectSchema = z.object({
 *   name: z.string().min(1),
 *   description: z.string().optional(),
 * })
 * 
 * export const POST = withValidation(
 *   { body: CreateProjectSchema },
 *   async ({ body }) => {
 *     // body is typed as { name: string; description?: string }
 *     return NextResponse.json({ created: body })
 *   }
 * )
 * ```
 */
export function withValidation<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
>(
  schemas: ValidationSchemas<TBody, TQuery, TParams>,
  handler: ValidatedHandler<TBody, TQuery, TParams>,
  options: ValidationOptions = {}
): (request: NextRequest, context?: { params?: Promise<Record<string, string>> }) => Promise<NextResponse> {
  const { stripUnknown = true, errorStatus = 400 } = options

  return async (request: NextRequest, context?: { params?: Promise<Record<string, string>> }): Promise<NextResponse> => {
    try {
      let validatedBody: TBody = undefined as TBody
      let validatedQuery: TQuery = undefined as TQuery
      let validatedParams: TParams = undefined as TParams

      // Validate request body if schema provided
      if (schemas.body) {
        let rawBody: unknown
        try {
          rawBody = await request.json()
        } catch {
          return NextResponse.json(
            {
              error: 'Validation Error',
              message: 'Invalid JSON in request body',
              details: [{ field: 'body', message: 'Invalid JSON', code: 'invalid_json' }],
            } satisfies ValidationErrorResponse,
            { status: errorStatus }
          )
        }

        // Apply strip for unknown fields
        const schemaToUse = stripUnknown && schemas.body instanceof z.ZodObject
          ? (schemas.body as z.ZodObject<z.ZodRawShape>).strip()
          : schemas.body
        
        const bodyResult = schemaToUse.safeParse(rawBody)
        if (!bodyResult.success) {
          return NextResponse.json(formatZodError(bodyResult.error), { status: errorStatus })
        }
        validatedBody = bodyResult.data as TBody
      }

      // Validate query parameters if schema provided
      if (schemas.query) {
        const rawQuery = parseQueryParams(request.nextUrl.searchParams)
        const queryResult = schemas.query.safeParse(rawQuery)
        if (!queryResult.success) {
          return NextResponse.json(formatZodError(queryResult.error), { status: errorStatus })
        }
        validatedQuery = queryResult.data
      }

      // Validate route params if schema provided
      if (schemas.params) {
        const rawParams = context?.params ? await context.params : {}
        const paramsResult = schemas.params.safeParse(rawParams)
        if (!paramsResult.success) {
          return NextResponse.json(formatZodError(paramsResult.error), { status: errorStatus })
        }
        validatedParams = paramsResult.data
      }

      // Call the handler with validated data
      return await handler({
        body: validatedBody,
        query: validatedQuery,
        params: validatedParams,
        request,
      })
    } catch (err) {
      // Handle unexpected errors
      const message = err instanceof Error ? err.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

/**
 * Validate request body only (convenience wrapper)
 */
export function withBodyValidation<TBody>(
  schema: ZodSchema<TBody>,
  handler: (body: TBody, request: NextRequest) => Promise<NextResponse> | NextResponse,
  options?: ValidationOptions
) {
  return withValidation(
    { body: schema },
    ({ body, request }) => handler(body, request),
    options
  )
}

/**
 * Validate query parameters only (convenience wrapper)
 */
export function withQueryValidation<TQuery>(
  schema: ZodSchema<TQuery>,
  handler: (query: TQuery, request: NextRequest) => Promise<NextResponse> | NextResponse,
  options?: ValidationOptions
) {
  return withValidation(
    { query: schema },
    ({ query, request }) => handler(query, request),
    options
  )
}

/**
 * Validate route params only (convenience wrapper)
 */
export function withParamsValidation<TParams>(
  schema: ZodSchema<TParams>,
  handler: (params: TParams, request: NextRequest) => Promise<NextResponse> | NextResponse,
  options?: ValidationOptions
) {
  return withValidation(
    { params: schema },
    ({ params, request }) => handler(params, request),
    options
  )
}

/**
 * Create a reusable validation wrapper with preset options
 */
export function createValidationMiddleware(defaultOptions: ValidationOptions = {}) {
  return function <TBody = unknown, TQuery = unknown, TParams = unknown>(
    schemas: ValidationSchemas<TBody, TQuery, TParams>,
    handler: ValidatedHandler<TBody, TQuery, TParams>,
    options?: ValidationOptions
  ) {
    return withValidation(schemas, handler, { ...defaultOptions, ...options })
  }
}
