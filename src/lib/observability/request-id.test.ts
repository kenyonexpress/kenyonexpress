import { describe, expect, it } from 'vitest'
import { REQUEST_ID_HEADER, newRequestId, readRequestId, resolveRequestId } from './request-id'

function headersWith(value: string): Headers {
  const headers = new Headers()
  headers.set(REQUEST_ID_HEADER, value)
  return headers
}

describe('readRequestId', () => {
  it('keeps an inbound id so a trace that started upstream stays one trace', () => {
    const id = '6f9619ff-8b86-d011-b42d-00c04fc964ff'
    expect(readRequestId(headersWith(id))).toBe(id)
  })

  it('keeps the shapes real platforms send', () => {
    // Vercel, Cloudflare ray id, and an OpenTelemetry traceparent-style value.
    for (const id of [
      'iad1::abcde-1730000000000-0123456789ab',
      '8a1f2c3d4e5f6789',
      '00-4bf92f-01',
    ]) {
      expect(readRequestId(headersWith(id))).toBe(id)
    }
  })

  it('is null when the header is absent', () => {
    expect(readRequestId(new Headers())).toBeNull()
  })

  it('rejects an id that would dominate every log line for the request', () => {
    expect(readRequestId(headersWith('a'.repeat(129)))).toBeNull()
    expect(readRequestId(headersWith('a'.repeat(128)))).not.toBeNull()
  })

  it('rejects characters an id is not made of', () => {
    // The value is echoed in a response header and repeated on every log line.
    for (const bad of ['has space', 'quote"', 'semi;colon', 'sl/ash', '<script>', '']) {
      expect(readRequestId(headersWith(bad))).toBeNull()
    }
  })
})

describe('resolveRequestId', () => {
  it('mints when there is nothing usable, rather than failing the request', () => {
    const minted = resolveRequestId(headersWith('not a valid id'))
    expect(minted).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('prefers the inbound id over a new one', () => {
    expect(resolveRequestId(headersWith('upstream-1'))).toBe('upstream-1')
  })
})

describe('newRequestId', () => {
  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()))
    expect(ids.size).toBe(500)
  })
})
