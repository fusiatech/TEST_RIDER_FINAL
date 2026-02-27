import { z } from 'zod'

/**
 * Common validation schemas for API routes
 * BE-014: Consistent input validation across API routes
 */

/**
 * UUID v4 format validation
 */
export const UUIDSchema = z.string().uuid('Invalid UUID format')

/**
 * ID parameter schema - accepts UUID or any non-empty string ID
 */
export const IdSchema = z.string().min(1, 'ID is required')

/**
 * Strict UUID ID schema - only accepts valid UUID v4 format
 */
export const StrictIdSchema = UUIDSchema

/**
 * Pagination schema for list endpoints
 * Supports both page-based and offset-based pagination
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).optional(),
})
export type Pagination = z.infer<typeof PaginationSchema>

/**
 * Calculate offset from page and limit
 */
export function calculateOffset(pagination: Pagination): number {
  if (pagination.offset !== undefined) {
    return pagination.offset
  }
  return (pagination.page - 1) * pagination.limit
}

/**
 * Date range schema for filtering by date
 */
export const DateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate
    }
    return true
  },
  { message: 'startDate must be before or equal to endDate' }
)
export type DateRange = z.infer<typeof DateRangeSchema>

/**
 * ISO date string schema
 */
export const ISODateStringSchema = z.string().datetime({ message: 'Invalid ISO date string' })

/**
 * Unix timestamp schema (milliseconds)
 */
export const TimestampSchema = z.coerce.number().int().min(0)

/**
 * Sort order schema
 */
export const SortOrderSchema = z.enum(['asc', 'desc']).default('desc')
export type SortOrder = z.infer<typeof SortOrderSchema>

/**
 * Generic sort schema factory
 */
export function createSortSchema<T extends readonly string[]>(fields: T) {
  return z.object({
    sortBy: z.enum(fields as unknown as [string, ...string[]]).optional(),
    sortOrder: SortOrderSchema,
  })
}

/**
 * Search query schema
 */
export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500).optional(),
})
export type SearchQuery = z.infer<typeof SearchQuerySchema>

/**
 * Common list query schema combining pagination and search
 */
export const ListQuerySchema = PaginationSchema.merge(SearchQuerySchema)
export type ListQuery = z.infer<typeof ListQuerySchema>

/**
 * Email schema with normalization
 */
export const EmailSchema = z.string().email().transform((email) => email.toLowerCase().trim())

/**
 * Non-empty string schema
 */
export const NonEmptyStringSchema = z.string().min(1, 'This field cannot be empty').trim()

/**
 * Slug schema (URL-safe identifier)
 */
export const SlugSchema = z.string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')

/**
 * Path schema for file paths
 */
export const PathSchema = z.string()
  .min(1)
  .max(1000)
  .refine(
    (path) => !path.includes('..'),
    { message: 'Path traversal not allowed' }
  )
