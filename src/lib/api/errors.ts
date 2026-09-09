/**
 * Typed API error for route handlers.
 *
 * Codes are snake_case strings because that is what every existing route
 * already returns in its `error` field ({ ok: false, error: 'rate_limited' });
 * new handlers throwing ApiError stay wire-compatible with them.
 */

export const API_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
}

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(
    code: ApiErrorCode,
    options: { message?: string; status?: number; details?: unknown } = {},
  ) {
    super(options.message ?? code)
    this.name = 'ApiError'
    this.code = code
    this.status = options.status ?? DEFAULT_STATUS[code]
    this.details = options.details
  }

  static invalidRequest(message?: string, details?: unknown): ApiError {
    return new ApiError('invalid_request', { message, details })
  }

  static unauthorized(message?: string): ApiError {
    return new ApiError('unauthorized', { message })
  }

  static forbidden(message?: string): ApiError {
    return new ApiError('forbidden', { message })
  }

  static notFound(message?: string): ApiError {
    return new ApiError('not_found', { message })
  }

  static conflict(message?: string, details?: unknown): ApiError {
    return new ApiError('conflict', { message, details })
  }

  static rateLimited(message?: string): ApiError {
    return new ApiError('rate_limited', { message })
  }

  static internal(message?: string): ApiError {
    return new ApiError('internal_error', { message })
  }

  static serviceUnavailable(message?: string): ApiError {
    return new ApiError('service_unavailable', { message })
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}
