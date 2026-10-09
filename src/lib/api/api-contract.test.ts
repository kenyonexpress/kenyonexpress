import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  ApiError,
  apiErrorEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  errorResponse,
  isApiError,
  jsonError,
  jsonOk,
  paginationQuerySchema,
  parseJsonBody,
} from './index'

describe('ApiError', () => {
  it('maps each code to its default status', () => {
    expect(ApiError.invalidRequest().status).toBe(400)
    expect(ApiError.unauthorized().status).toBe(401)
    expect(ApiError.forbidden().status).toBe(403)
    expect(ApiError.notFound().status).toBe(404)
    expect(ApiError.conflict().status).toBe(409)
    expect(ApiError.rateLimited().status).toBe(429)
    expect(ApiError.internal().status).toBe(500)
    expect(ApiError.serviceUnavailable().status).toBe(503)
  })

  it('allows a status override and is detected by the guard', () => {
    const err = new ApiError('invalid_request', { status: 422 })
    expect(err.status).toBe(422)
    expect(isApiError(err)).toBe(true)
    expect(isApiError(new Error('invalid_request'))).toBe(false)
  })
})

describe('envelope helpers', () => {
  it('jsonOk wraps data in the success envelope', async () => {
    const res = jsonOk({ id: 'x' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(apiSuccessEnvelopeSchema(z.object({ id: z.string() })).parse(body)).toEqual({
      ok: true,
      data: { id: 'x' },
    })
  })

  it('jsonError emits the flat error envelope with the code as error', async () => {
    const res = jsonError(ApiError.rateLimited())
    expect(res.status).toBe(429)
    const body = apiErrorEnvelopeSchema.parse(await res.json())
    expect(body).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('jsonError carries a human message and details when present', async () => {
    const res = jsonError(ApiError.invalidRequest('כמות לא תקינה', { quantity: ['min 1'] }))
    const body = apiErrorEnvelopeSchema.parse(await res.json())
    expect(body.message).toBe('כמות לא תקינה')
    expect(body.details).toEqual({ quantity: ['min 1'] })
  })

  it('errorResponse maps ZodError to invalid_request with field errors', async () => {
    const parsed = z.object({ quantity: z.number() }).safeParse({ quantity: 'x' })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    const res = errorResponse(parsed.error)
    expect(res.status).toBe(400)
    const body = apiErrorEnvelopeSchema.parse(await res.json())
    expect(body.error).toBe('invalid_request')
    expect(body.details).toHaveProperty('quantity')
  })

  it('errorResponse hides unknown throwables behind internal_error', async () => {
    const res = errorResponse(new Error('secret db string'))
    expect(res.status).toBe(500)
    const body = apiErrorEnvelopeSchema.parse(await res.json())
    expect(body).toEqual({ ok: false, error: 'internal_error' })
  })
})

describe('parseJsonBody', () => {
  const schema = z.object({ name: z.string().min(1) })

  const jsonRequest = (body: string) =>
    new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })

  it('returns parsed data for a valid body', async () => {
    await expect(parseJsonBody(jsonRequest('{"name":"ofir"}'), schema)).resolves.toEqual({
      name: 'ofir',
    })
  })

  it('throws invalid_request on malformed JSON', async () => {
    await expect(parseJsonBody(jsonRequest('not json'), schema)).rejects.toMatchObject({
      code: 'invalid_request',
      status: 400,
    })
  })

  it('throws invalid_request with field errors on schema failure', async () => {
    await expect(parseJsonBody(jsonRequest('{"name":""}'), schema)).rejects.toMatchObject({
      code: 'invalid_request',
      details: expect.objectContaining({ name: expect.anything() }),
    })
  })
})

describe('paginationQuerySchema', () => {
  it('coerces query-string values and applies defaults', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({
      page: 3,
      limit: 50,
    })
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 })
  })

  it('rejects out-of-range limits', () => {
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })
})
