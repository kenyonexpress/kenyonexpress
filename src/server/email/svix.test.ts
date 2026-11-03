import { createHmac } from 'node:crypto'
import { SVIX_TOLERANCE_SECONDS, verifySvixSignature } from '@/server/email/svix'
import { describe, expect, it } from 'vitest'

/**
 * The signature is the whole of this endpoint's authentication, and the
 * endpoint writes the suppression list. A forged `email.bounced` stops a
 * customer receiving the coupon they paid for, so these are the cases that
 * matter more than the happy path.
 */

const SECRET_BYTES = Buffer.from('a'.repeat(32), 'utf8')
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`
const NOW = 1_760_000_000

function sign(id: string, timestamp: number, body: string, secret = SECRET_BYTES): string {
  return createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64')
}

const BODY = JSON.stringify({ type: 'email.bounced', data: { to: ['x@y.com'] } })

function headers(overrides: Partial<{ id: string; timestamp: string; signature: string }> = {}) {
  return {
    id: overrides.id ?? 'msg_1',
    timestamp: overrides.timestamp ?? String(NOW),
    signature: overrides.signature ?? `v1,${sign('msg_1', NOW, BODY)}`,
  }
}

describe('verifySvixSignature', () => {
  it('accepts a correctly signed message', () => {
    expect(
      verifySvixSignature({ secret: SECRET, headers: headers(), body: BODY, nowSeconds: NOW }),
    ).toEqual({ ok: true })
  })

  it('accepts a secret written without the whsec_ prefix', () => {
    expect(
      verifySvixSignature({
        secret: SECRET_BYTES.toString('base64'),
        headers: headers(),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it('refuses everything when no secret is configured', () => {
    // An unconfigured deploy is a CLOSED one. The alternative is an
    // unauthenticated endpoint that writes the suppression list.
    expect(
      verifySvixSignature({
        secret: undefined,
        headers: headers(),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'not_configured' })
  })

  it('refuses a body that was altered after signing', () => {
    const tampered = JSON.stringify({ type: 'email.bounced', data: { to: ['victim@y.com'] } })
    expect(
      verifySvixSignature({ secret: SECRET, headers: headers(), body: tampered, nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('refuses a signature made with a different secret', () => {
    const other = Buffer.from('b'.repeat(32), 'utf8')
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ signature: `v1,${sign('msg_1', NOW, BODY, other)}` }),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('refuses a replay from outside the tolerance, in both directions', () => {
    // Without the timestamp check a captured signature is valid forever, and
    // replaying a bounce suppresses somebody's mail permanently.
    const old = NOW - SVIX_TOLERANCE_SECONDS - 1
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: {
          id: 'msg_1',
          timestamp: String(old),
          signature: `v1,${sign('msg_1', old, BODY)}`,
        },
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'stale' })

    const future = NOW + SVIX_TOLERANCE_SECONDS + 1
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: {
          id: 'msg_1',
          timestamp: String(future),
          signature: `v1,${sign('msg_1', future, BODY)}`,
        },
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'stale' })
  })

  it('accepts a message signed at the edge of the tolerance', () => {
    const edge = NOW - SVIX_TOLERANCE_SECONDS
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: {
          id: 'msg_1',
          timestamp: String(edge),
          signature: `v1,${sign('msg_1', edge, BODY)}`,
        },
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it('refuses a signature bound to a different message id', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ id: 'msg_2' }),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('accepts when one of several rotation signatures matches', () => {
    const other = Buffer.from('c'.repeat(32), 'utf8')
    const both = `v1,${sign('msg_1', NOW, BODY, other)} v1,${sign('msg_1', NOW, BODY)}`
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ signature: both }),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it('ignores a version it does not know rather than being confused by it', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ signature: `v2,anything v1,${sign('msg_1', NOW, BODY)}` }),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: true })
  })

  it('refuses a request with headers missing', () => {
    for (const missing of ['id', 'timestamp', 'signature'] as const) {
      const h = { ...headers(), [missing]: null }
      expect(
        verifySvixSignature({ secret: SECRET, headers: h, body: BODY, nowSeconds: NOW }),
      ).toEqual({ ok: false, reason: 'missing_headers' })
    }
  })

  it('refuses a timestamp that is not a number', () => {
    expect(
      verifySvixSignature({
        secret: SECRET,
        headers: headers({ timestamp: 'yesterday' }),
        body: BODY,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'stale' })
  })
})
