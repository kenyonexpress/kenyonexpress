import { NextResponse } from 'next/server'
import { ZodError, type z } from 'zod'
import { ApiError, isApiError } from './errors'
import type { ApiErrorEnvelope, ApiSuccessEnvelope } from './schemas'

/**
 * Standard JSON envelope helpers for route handlers.
 *
 * Success: { ok: true, data }
 * Error:   { ok: false, error: <code>, message?, details? }
 */

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccessEnvelope<T>> {
  return NextResponse.json({ ok: true as const, data }, init)
}

export function jsonError(error: ApiError): NextResponse<ApiErrorEnvelope> {
  const body: ApiErrorEnvelope = { ok: false, error: error.code }
  if (error.message !== error.code) body.message = error.message
  if (error.details !== undefined) body.details = error.details
  return NextResponse.json(body, { status: error.status })
}

/**
 * Map any thrown value to an error envelope response.
 * ZodError becomes invalid_request with flattened field errors; unknown
 * throwables become a bare internal_error so internals never leak to clients.
 */
export function errorResponse(thrown: unknown): NextResponse<ApiErrorEnvelope> {
  if (isApiError(thrown)) return jsonError(thrown)
  if (thrown instanceof ZodError) {
    return jsonError(ApiError.invalidRequest(undefined, thrown.flatten().fieldErrors))
  }
  return jsonError(new ApiError('internal_error'))
}

/**
 * Parse a JSON request body against a schema.
 * Throws ApiError('invalid_request') on malformed JSON or schema failure,
 * so handlers can catch once with errorResponse().
 */
export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw ApiError.invalidRequest('גוף הבקשה אינו JSON תקין')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw ApiError.invalidRequest(undefined, parsed.error.flatten().fieldErrors)
  }
  return parsed.data
}
