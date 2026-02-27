import { NextRequest, NextResponse } from 'next/server'

export const API_VERSIONS = ['v1'] as const
export type ApiVersion = (typeof API_VERSIONS)[number]

export const CURRENT_VERSION: ApiVersion = 'v1'
export const DEFAULT_VERSION: ApiVersion = 'v1'

export const DEPRECATED_VERSIONS: ApiVersion[] = []

export const VERSION_HEADER = 'X-API-Version'
export const DEPRECATION_HEADER = 'X-API-Deprecation-Warning'

const VENDOR_MEDIA_TYPE_REGEX = /^application\/vnd\.swarmui\.v(\d+)\+json$/

export interface VersionInfo {
  version: ApiVersion
  source: 'accept-header' | 'url-path' | 'default'
  isDeprecated: boolean
}

/**
 * Extract API version from Accept header
 * Supports format: application/vnd.swarmui.v1+json
 */
export function extractVersionFromAcceptHeader(
  acceptHeader: string | null
): ApiVersion | null {
  if (!acceptHeader) return null

  const match = acceptHeader.match(VENDOR_MEDIA_TYPE_REGEX)
  if (!match) return null

  const versionNum = match[1]
  const version = `v${versionNum}` as ApiVersion

  if (API_VERSIONS.includes(version)) {
    return version
  }

  return null
}

/**
 * Extract API version from URL path
 * Supports format: /api/v1/...
 */
export function extractVersionFromUrlPath(pathname: string): ApiVersion | null {
  const versionMatch = pathname.match(/^\/api\/(v\d+)\//)
  if (!versionMatch) return null

  const version = versionMatch[1] as ApiVersion

  if (API_VERSIONS.includes(version)) {
    return version
  }

  return null
}

/**
 * Get API version from request, checking Accept header first, then URL path
 */
export function getApiVersion(request: NextRequest): VersionInfo {
  const acceptHeader = request.headers.get('Accept')
  const headerVersion = extractVersionFromAcceptHeader(acceptHeader)

  if (headerVersion) {
    return {
      version: headerVersion,
      source: 'accept-header',
      isDeprecated: DEPRECATED_VERSIONS.includes(headerVersion),
    }
  }

  const urlVersion = extractVersionFromUrlPath(request.nextUrl.pathname)

  if (urlVersion) {
    return {
      version: urlVersion,
      source: 'url-path',
      isDeprecated: DEPRECATED_VERSIONS.includes(urlVersion),
    }
  }

  return {
    version: DEFAULT_VERSION,
    source: 'default',
    isDeprecated: false,
  }
}

/**
 * Check if a version is supported
 */
export function isVersionSupported(version: string): version is ApiVersion {
  return API_VERSIONS.includes(version as ApiVersion)
}

/**
 * Check if a version is deprecated
 */
export function isVersionDeprecated(version: ApiVersion): boolean {
  return DEPRECATED_VERSIONS.includes(version)
}

/**
 * Add version headers to response
 */
export function addVersionHeaders(
  response: NextResponse,
  versionInfo: VersionInfo
): NextResponse {
  response.headers.set(VERSION_HEADER, versionInfo.version)

  if (versionInfo.isDeprecated) {
    response.headers.set(
      DEPRECATION_HEADER,
      `API version ${versionInfo.version} is deprecated. Please migrate to ${CURRENT_VERSION}.`
    )
  }

  return response
}

/**
 * Create a versioned response with appropriate headers
 */
export function createVersionedResponse<T>(
  data: T,
  versionInfo: VersionInfo,
  options?: { status?: number }
): NextResponse {
  const response = NextResponse.json(data, { status: options?.status ?? 200 })
  return addVersionHeaders(response, versionInfo)
}

/**
 * Create an error response for unsupported API version
 */
export function createUnsupportedVersionResponse(
  requestedVersion: string
): NextResponse {
  return NextResponse.json(
    {
      error: 'Unsupported API Version',
      message: `API version '${requestedVersion}' is not supported. Supported versions: ${API_VERSIONS.join(', ')}`,
      supportedVersions: API_VERSIONS,
      currentVersion: CURRENT_VERSION,
    },
    { status: 400 }
  )
}

/**
 * Middleware helper to extract and validate API version
 */
export function withApiVersion<T>(
  handler: (
    request: NextRequest,
    versionInfo: VersionInfo,
    ...args: unknown[]
  ) => Promise<NextResponse<T>>
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const versionInfo = getApiVersion(request)
    const response = await handler(request, versionInfo, ...args)
    return addVersionHeaders(response, versionInfo)
  }
}

/**
 * Get the Accept header value for a specific version
 */
export function getAcceptHeaderForVersion(version: ApiVersion): string {
  const versionNum = version.replace('v', '')
  return `application/vnd.swarmui.v${versionNum}+json`
}

/**
 * Build a versioned API path
 */
export function buildVersionedPath(
  path: string,
  version: ApiVersion = CURRENT_VERSION
): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const pathWithoutVersion = cleanPath.replace(/^\/api\/v\d+\//, '/api/')
  const basePath = pathWithoutVersion.replace(/^\/api\//, '')
  return `/api/${version}/${basePath}`
}
