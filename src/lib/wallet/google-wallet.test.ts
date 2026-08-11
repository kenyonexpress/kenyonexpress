import { generateKeyPairSync } from 'node:crypto'
import { createVerify } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleWalletConfig } from './config'
import {
  __resetGoogleWalletTokenCache,
  buildSaveUrl,
  encodeJwt,
  pushGoogleObjectState,
} from './google-wallet'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

const CONFIG: GoogleWalletConfig = {
  issuerId: '3388000000000000000',
  serviceAccountEmail: 'wallet@example.iam.gserviceaccount.com',
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  classSuffix: 'kenyon_voucher',
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('encodeJwt', () => {
  it('produces a signature the public key accepts', () => {
    // Not a shape assertion: a JWT Google will not verify is a save link that
    // errors on the customer's phone, and nothing on our side ever hears about it.
    const jwt = encodeJwt({ hello: 'world' }, CONFIG.privateKeyPem)
    const [header, payload, signature] = jwt.split('.')
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${header}.${payload}`)
    verifier.end()
    expect(verifier.verify(publicKey, Buffer.from(signature as string, 'base64url'))).toBe(true)
  })

  it('uses base64url, so the token survives being put in a path', () => {
    const jwt = encodeJwt({ pad: 'ÿÿÿ' }, CONFIG.privateKeyPem)
    expect(jwt).not.toMatch(/[+/=]/)
  })
})

describe('buildSaveUrl', () => {
  const object = { id: '3388000000000000000.abc', classId: '3388000000000000000.kenyon_voucher' }
  const options = {
    origin: 'https://kenyonexpress.co.il',
    issuedAt: new Date('2026-08-06T10:00:00Z'),
  }

  it('points at the save endpoint and carries the object inline', () => {
    const url = buildSaveUrl(object, CONFIG, options)
    expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true)
    const claims = decodeSegment(url.split('/save/')[1]?.split('.')[1] as string)
    expect(claims.payload).toEqual({ genericObjects: [object] })
    expect(claims.typ).toBe('savetowallet')
  })

  it('declares the origin, which Google checks against the clicking page', () => {
    const claims = decodeSegment(
      buildSaveUrl(object, CONFIG, options).split('/save/')[1]?.split('.')[1] as string,
    )
    expect(claims.origins).toEqual(['https://kenyonexpress.co.il'])
  })

  it('is the same link for the same voucher twice', () => {
    // `iat` is a parameter and not the clock, so two renders of the coupon page
    // are one pass and not two.
    expect(buildSaveUrl(object, CONFIG, options)).toBe(buildSaveUrl(object, CONFIG, options))
  })
})

describe('pushGoogleObjectState', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    __resetGoogleWalletTokenCache()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function tokenOk(): void {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    })
  }

  it('says skipped, not ok, when the platform is not configured', async () => {
    // The one answer this must never give is a green that means "did nothing".
    expect(await pushGoogleObjectState('id', { state: 'EXPIRED' }, null)).toEqual({
      outcome: 'skipped',
      reason: 'not_configured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('patches the object with an access token it minted', async () => {
    tokenOk()
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 })

    const result = await pushGoogleObjectState('issuer.abc', { state: 'EXPIRED' }, CONFIG)
    expect(result).toEqual({ outcome: 'ok' })

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe(
      'https://walletobjects.googleapis.com/walletobjects/v1/genericObject/issuer.abc',
    )
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  })

  it('reuses the token across calls rather than minting one per redemption', async () => {
    tokenOk()
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    await pushGoogleObjectState('a', {}, CONFIG)
    await pushGoogleObjectState('b', {}, CONFIG)
    // token + patch + patch, not token + patch + token + patch.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats 404 as done: the customer never saved the pass', async () => {
    tokenOk()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    expect(await pushGoogleObjectState('missing', {}, CONFIG)).toEqual({ outcome: 'ok' })
  })

  it('reports a failure without throwing at a redemption that already committed', async () => {
    tokenOk()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    expect(await pushGoogleObjectState('id', {}, CONFIG)).toEqual({
      outcome: 'failed',
      reason: 'http_500',
    })
  })

  it('survives the network being gone', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await pushGoogleObjectState('id', {}, CONFIG)).toEqual({
      outcome: 'failed',
      reason: 'ECONNREFUSED',
    })
  })

  it('does not patch on a token the endpoint refused', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    expect(await pushGoogleObjectState('id', {}, CONFIG)).toEqual({
      outcome: 'failed',
      reason: 'no_access_token',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
