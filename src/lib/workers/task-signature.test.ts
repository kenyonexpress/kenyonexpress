// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  constantTimeEqualHex,
  parseSignatureHeader,
  signTask,
  verifyTaskSignature,
} from './task-signature'

const SECRET = 'a-shared-secret-of-reasonable-length'
const BODY = '{"type":"warm-urls","urls":["https://kenyonexpress.co.il/"]}'
const NOW = 1_758_000_000_000

describe('signTask / verifyTaskSignature', () => {
  it('round-trips', async () => {
    const header = await signTask(SECRET, BODY, NOW)
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(await verifyTaskSignature(SECRET, header, BODY, { nowMs: NOW })).toEqual({ ok: true })
  })

  it('binds the body', async () => {
    const header = await signTask(SECRET, BODY, NOW)
    const tampered = BODY.replace('warm-urls', 'webhook-fanout')
    expect(await verifyTaskSignature(SECRET, header, tampered, { nowMs: NOW })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('binds the timestamp, so editing it fails the MAC rather than extending the window', async () => {
    const header = await signTask(SECRET, BODY, NOW)
    const edited = header.replace(/^t=\d+/, `t=${Math.floor(NOW / 1000) + 60}`)
    expect(await verifyTaskSignature(SECRET, edited, BODY, { nowMs: NOW })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('refuses a replay outside the tolerance in either direction', async () => {
    const header = await signTask(SECRET, BODY, NOW)
    expect(await verifyTaskSignature(SECRET, header, BODY, { nowMs: NOW + 301_000 })).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(await verifyTaskSignature(SECRET, header, BODY, { nowMs: NOW - 301_000 })).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(await verifyTaskSignature(SECRET, header, BODY, { nowMs: NOW + 299_000 })).toEqual({
      ok: true,
    })
  })

  it('refuses a different secret', async () => {
    const header = await signTask(SECRET, BODY, NOW)
    expect(await verifyTaskSignature(`${SECRET}x`, header, BODY, { nowMs: NOW })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('names the missing pieces', async () => {
    expect(await verifyTaskSignature(undefined, 't=1,v1=00', BODY)).toEqual({
      ok: false,
      reason: 'no-secret',
    })
    expect(await verifyTaskSignature(SECRET, null, BODY)).toEqual({ ok: false, reason: 'missing' })
    expect(await verifyTaskSignature(SECRET, 'garbage', BODY)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})

describe('parseSignatureHeader', () => {
  it('reads the two fields in any order and ignores unknown ones', () => {
    const hex = 'ab'.repeat(32)
    expect(parseSignatureHeader(`v1=${hex}, t=12, v0=zzz`)).toEqual({ t: 12, v1: hex })
  })

  it('rejects a non-hex or short signature', () => {
    expect(parseSignatureHeader('t=12,v1=abc')).toBeNull()
    expect(parseSignatureHeader(`t=x,v1=${'ab'.repeat(32)}`)).toBeNull()
  })
})

describe('constantTimeEqualHex', () => {
  it('compares whole strings', () => {
    expect(constantTimeEqualHex('abcd', 'abcd')).toBe(true)
    expect(constantTimeEqualHex('abcd', 'abce')).toBe(false)
    expect(constantTimeEqualHex('abcd', 'abc')).toBe(false)
  })
})
