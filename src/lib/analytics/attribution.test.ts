import { describe, expect, it } from 'vitest'
import {
  mergeAttribution,
  parseAttribution,
  readUtmFromQuery,
  serializeAttribution,
  utmForEvent,
} from './attribution'

/**
 * `parseAttribution` used to be a zod schema. STEP 34 replaced it with a hand
 * parser to keep zod out of the browser tracker's graph, and these cases pin
 * the semantics the schema had: strict keys, strings only, per-key caps, and
 * a whole-cookie rejection rather than a repaired one.
 */
describe('parseAttribution', () => {
  const touch = { utm_source: 'google', utm_medium: 'cpc', at: '2026-10-07T10:00:00.000Z' }

  it('accepts the shape the tracker writes, with first and last', () => {
    const raw = serializeAttribution({ first: touch, last: { ...touch, utm_source: 'meta' } })
    expect(parseAttribution(raw)).toEqual({
      first: touch,
      last: { ...touch, utm_source: 'meta' },
    })
  })

  it('accepts an empty object and a single side', () => {
    expect(parseAttribution('{}')).toEqual({})
    expect(parseAttribution(JSON.stringify({ last: touch }))).toEqual({ last: touch })
    expect(parseAttribution(JSON.stringify({ last: {} }))).toEqual({ last: {} })
  })

  it('returns null for nothing, malformed JSON, and non-objects', () => {
    expect(parseAttribution(undefined)).toBeNull()
    expect(parseAttribution(null)).toBeNull()
    expect(parseAttribution('')).toBeNull()
    expect(parseAttribution('{not json')).toBeNull()
    expect(parseAttribution('"a string"')).toBeNull()
    expect(parseAttribution('[]')).toBeNull()
    expect(parseAttribution('null')).toBeNull()
  })

  it('is strict about keys at both levels', () => {
    expect(parseAttribution(JSON.stringify({ last: touch, extra: 1 }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: { ...touch, gclid: 'x' } }))).toBeNull()
  })

  it('rejects non-string values and arrays where a touch should be', () => {
    expect(parseAttribution(JSON.stringify({ last: { utm_source: 1 } }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: { utm_source: null } }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: [touch] }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: 'google' }))).toBeNull()
  })

  it('enforces the per-key caps: 120 for source and medium, 200 for the rest', () => {
    const ok120 = 'a'.repeat(120)
    const ok200 = 'a'.repeat(200)
    expect(parseAttribution(JSON.stringify({ last: { utm_source: ok120 } }))).toEqual({
      last: { utm_source: ok120 },
    })
    expect(parseAttribution(JSON.stringify({ last: { utm_source: `${ok120}a` } }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: { utm_medium: `${ok120}a` } }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: { utm_campaign: ok200 } }))).toEqual({
      last: { utm_campaign: ok200 },
    })
    expect(parseAttribution(JSON.stringify({ last: { utm_campaign: `${ok200}a` } }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: { utm_content: `${ok200}a` } }))).toBeNull()
    expect(parseAttribution(JSON.stringify({ last: { utm_term: `${ok200}a` } }))).toBeNull()
  })

  it('leaves `at` uncapped, as the schema did', () => {
    const at = 'x'.repeat(500)
    expect(parseAttribution(JSON.stringify({ first: { at } }))).toEqual({ first: { at } })
  })
})

describe('the helpers around it', () => {
  it('readUtmFromQuery reads lower and upper case keys, trims, and caps at 200', () => {
    const touch = readUtmFromQuery(`?UTM_SOURCE= google &utm_term=${'t'.repeat(300)}&x=1`)
    expect(touch).toEqual({ utm_source: 'google', utm_term: 't'.repeat(200) })
    expect(readUtmFromQuery('?x=1')).toBeNull()
  })

  it('mergeAttribution keeps the first touch and stamps the last', () => {
    const now = new Date('2026-10-07T12:00:00.000Z')
    const first = { utm_source: 'google', at: '2026-10-01T00:00:00.000Z' }
    const merged = mergeAttribution({ first, last: first }, { utm_source: 'meta' }, now)
    expect(merged).toEqual({ first, last: { utm_source: 'meta', at: now.toISOString() } })
    expect(mergeAttribution(null, null, now)).toEqual({})
  })

  it('utmForEvent drops `at` and returns undefined for an empty touch', () => {
    expect(utmForEvent({ utm_source: 'google', at: 'x' })).toEqual({ utm_source: 'google' })
    expect(utmForEvent({ at: 'x' })).toBeUndefined()
    expect(utmForEvent(null)).toBeUndefined()
  })
})
