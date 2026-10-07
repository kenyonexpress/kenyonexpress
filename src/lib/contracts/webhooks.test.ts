import { describe, expect, it } from 'vitest'
import {
  cardcomCallbackVerdict,
  cardcomWebhookPayloadSchema,
  isCardcomSuccess,
  parseCardcomCallback,
} from './webhooks'

/**
 * The callback contract, measured against what the legacy IndicatorUrl really
 * carries (08.10.2026): Cardcom's own article lists `terminalnumber` and
 * `lowprofilecode`, the request is a GET, and there is no verdict field. Two
 * public integrations (sheltermanager/asm3, thebarlev/app.ux) read exactly
 * that and ask the terminal. A schema that required `ResponseCode` refused
 * every real indicator as "unparsed".
 */
describe('the legacy indicator shape', () => {
  it('parses the three parameters Cardcom documents, with no verdict field', () => {
    const parsed = cardcomWebhookPayloadSchema.safeParse({
      terminalnumber: '1000',
      lowprofilecode: 'aa-bb-cc',
      Operation: '1',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(cardcomCallbackVerdict(parsed.data)).toBe('unknown')
      expect(isCardcomSuccess(parsed.data)).toBe(false)
    }
  })

  it('still refuses a body with no low profile code', () => {
    expect(cardcomWebhookPayloadSchema.safeParse({ terminalnumber: 1000 }).success).toBe(false)
    expect(cardcomWebhookPayloadSchema.safeParse({ hello: 'world' }).success).toBe(false)
  })
})

describe('the verdict', () => {
  const base = { terminalnumber: 1000, lowprofilecode: 'lp' }

  it('is success only when every verdict field present is zero', () => {
    expect(cardcomCallbackVerdict({ ...base, ResponseCode: 0 })).toBe('success')
    expect(cardcomCallbackVerdict({ ...base, OperationResponse: 0, DealResponse: 0 })).toBe(
      'success',
    )
  })

  it('is failure when any verdict field present is non-zero', () => {
    expect(cardcomCallbackVerdict({ ...base, ResponseCode: 500 })).toBe('failure')
    // The indicator's own pair: the operation went through, the deal did not.
    expect(cardcomCallbackVerdict({ ...base, OperationResponse: 0, DealResponse: 33 })).toBe(
      'failure',
    )
  })

  it('is unknown when no verdict field is present at all', () => {
    expect(cardcomCallbackVerdict({ ...base, Operation: '2' })).toBe('unknown')
  })

  it('coerces the string codes a form body delivers', () => {
    const parsed = cardcomWebhookPayloadSchema.parse({
      ...base,
      ResponseCode: '0',
      DealResponse: '0',
    })
    expect(cardcomCallbackVerdict(parsed)).toBe('success')
  })
})

describe('where the fields are', () => {
  const query = (qs: string) => new URLSearchParams(qs)

  it('reads a GET indicator off the query string and drops our secret', () => {
    const out = parseCardcomCallback(
      '',
      query('s=the-secret&terminalnumber=1000&lowprofilecode=lp-1&Operation=1'),
    )
    expect(out).toEqual({ terminalnumber: '1000', lowprofilecode: 'lp-1', Operation: '1' })
    expect(out).not.toHaveProperty('s')
  })

  it('reads a form-encoded POST body', () => {
    const out = parseCardcomCallback(
      'terminalnumber=1000&lowprofilecode=lp-1&ResponseCode=0&InternalDealNumber=77',
      query('s=the-secret'),
    )
    expect(out).toEqual({
      terminalnumber: '1000',
      lowprofilecode: 'lp-1',
      ResponseCode: '0',
      InternalDealNumber: '77',
    })
  })

  it('reads a JSON body, which is what the mock and the tests send', () => {
    const out = parseCardcomCallback(
      JSON.stringify({ terminalnumber: 1000, lowprofilecode: 'lp-1', ResponseCode: 0 }),
      query('s=the-secret'),
    )
    expect(out).toEqual({ terminalnumber: 1000, lowprofilecode: 'lp-1', ResponseCode: 0 })
  })

  it('lets the body win over the query string on a shared key', () => {
    // The body is what Cardcom posted; the query string is a URL anyone can
    // construct. A deal number must not be overridable from the URL.
    const out = parseCardcomCallback(
      'lowprofilecode=from-body&InternalDealNumber=77',
      query('s=x&lowprofilecode=from-query&InternalDealNumber=99&terminalnumber=1000'),
    )
    expect(out).toMatchObject({
      lowprofilecode: 'from-body',
      InternalDealNumber: '77',
      terminalnumber: '1000',
    })
  })

  it('keeps garbage under raw so a scanner fails the schema rather than looking half-formed', () => {
    expect(parseCardcomCallback('garbage', query('s=x'))).toEqual({ raw: 'garbage' })
    expect(parseCardcomCallback('<xml/>', query(''))).toEqual({ raw: '<xml/>' })
    expect(parseCardcomCallback('[1,2]', query(''))).toEqual({ raw: '[1,2]' })
    expect(
      cardcomWebhookPayloadSchema.safeParse(parseCardcomCallback('garbage', query('s=x'))).success,
    ).toBe(false)
  })

  it('does not let a form body smuggle the secret key into the journalled payload', () => {
    const out = parseCardcomCallback('s=guess&lowprofilecode=lp-1', query(''))
    expect(out).toEqual({ lowprofilecode: 'lp-1' })
  })
})
