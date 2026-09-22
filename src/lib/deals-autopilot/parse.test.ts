import { describe, expect, it } from 'vitest'
import { parseCsvFeed, parseJsonFeed } from './parse'

describe('parseJsonFeed', () => {
  it('parses a bare array of entries', () => {
    const result = parseJsonFeed(
      JSON.stringify([{ name: 'עיסוי זוגי', price: '299', link: 'https://supplier.example/spa' }]),
    )
    expect(result.rejected).toEqual([])
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({
      nameHe: 'עיסוי זוגי',
      priceAgorot: 29900,
      linkUrl: 'https://supplier.example/spa',
    })
  })

  it('parses { "deals": [...] } the same way', () => {
    const result = parseJsonFeed(
      JSON.stringify({
        deals: [{ name: 'טיפול פנים', price: '150', link: 'https://supplier.example/facial' }],
      }),
    )
    expect(result.candidates).toHaveLength(1)
  })

  it('rejects invalid JSON without throwing', () => {
    const result = parseJsonFeed('{not json')
    expect(result.candidates).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects a JSON value that is neither an array nor {deals: [...]}', () => {
    const result = parseJsonFeed(JSON.stringify({ hello: 'world' }))
    expect(result.candidates).toEqual([])
    expect(result.rejected[0]?.reason).toMatch(/expected a JSON array/)
  })

  it('rejects an http (non-https) link', () => {
    const result = parseJsonFeed(
      JSON.stringify([{ name: 'x', price: '10', link: 'http://supplier.example/x' }]),
    )
    expect(result.candidates).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects an entry with no price', () => {
    const result = parseJsonFeed(JSON.stringify([{ name: 'x', link: 'https://s.example/x' }]))
    expect(result.candidates).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects a zero or negative price', () => {
    const result = parseJsonFeed(
      JSON.stringify([{ name: 'x', price: '0', link: 'https://s.example/x' }]),
    )
    expect(result.candidates).toEqual([])
  })

  it('drops full_price when it is not actually above price, rather than erroring', () => {
    const result = parseJsonFeed(
      JSON.stringify([{ name: 'x', price: '100', full_price: '90', link: 'https://s.example/x' }]),
    )
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.fullPriceAgorot).toBeNull()
  })

  it('rejects an out-of-range discount_percent', () => {
    const result = parseJsonFeed(
      JSON.stringify([
        { name: 'x', price: '10', discount_percent: '150', link: 'https://s.example/x' },
      ]),
    )
    expect(result.candidates).toEqual([])
    expect(result.rejected[0]?.reason).toMatch(/discount_percent/)
  })

  it('uses the supplied external_ref verbatim', () => {
    const result = parseJsonFeed(
      JSON.stringify([
        { external_ref: 'sku-42', name: 'x', price: '10', link: 'https://s.example/x' },
      ]),
    )
    expect(result.candidates[0]?.externalRef).toBe('sku-42')
  })

  it('derives a stable external_ref from name+link when the feed supplies none', () => {
    const one = parseJsonFeed(
      JSON.stringify([{ name: 'x', price: '10', link: 'https://s.example/x' }]),
    )
    const two = parseJsonFeed(
      JSON.stringify([{ name: 'x', price: '20', link: 'https://s.example/x' }]),
    )
    // Same name+link, different price (a re-fetch after a price change) ->
    // same derived ref, so the insert updates the row instead of duplicating it.
    expect(one.candidates[0]?.externalRef).toBe(two.candidates[0]?.externalRef)
  })

  it('rejects an unrecognized field rather than silently ignoring it', () => {
    // .strict() on feedEntrySchema: a feed that means to send something this
    // pipeline does not read (e.g. a made-up "platform_percent") is refused
    // per row rather than having the extra key vanish unremarked.
    const result = parseJsonFeed(
      JSON.stringify([
        { name: 'x', price: '10', link: 'https://s.example/x', platform_percent: 20 },
      ]),
    )
    expect(result.candidates).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })

  it('caps a huge feed rather than reading it unbounded', () => {
    const entries = Array.from({ length: 600 }, (_, i) => ({
      name: `x${i}`,
      price: '10',
      link: `https://s.example/${i}`,
    }))
    const result = parseJsonFeed(JSON.stringify(entries))
    expect(result.candidates).toHaveLength(500)
    expect(result.rejected.at(-1)?.reason).toMatch(/only the first 500/)
  })
})

describe('parseCsvFeed', () => {
  it('parses a header + one data row', () => {
    const csv = 'name,price,link\nעיסוי זוגי,299,https://supplier.example/spa\n'
    const result = parseCsvFeed(csv)
    expect(result.rejected).toEqual([])
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ nameHe: 'עיסוי זוגי', priceAgorot: 29900 })
  })

  it('handles a quoted field containing a comma', () => {
    const csv = 'name,price,link\n"טיפול, פנים",150,https://supplier.example/facial\n'
    const result = parseCsvFeed(csv)
    expect(result.candidates[0]?.nameHe).toBe('טיפול, פנים')
  })

  it('skips a blank trailing line rather than treating it as an invalid row', () => {
    const csv = 'name,price,link\nx,10,https://s.example/x\n\n'
    const result = parseCsvFeed(csv)
    expect(result.candidates).toHaveLength(1)
    expect(result.rejected).toEqual([])
  })

  it('strips a UTF-8 BOM from the header', () => {
    const csv = `${'﻿'}name,price,link\nx,10,https://s.example/x\n`
    const result = parseCsvFeed(csv)
    expect(result.candidates).toHaveLength(1)
  })

  it('reports an empty file rather than an empty success', () => {
    const result = parseCsvFeed('')
    expect(result.candidates).toEqual([])
    expect(result.rejected).toHaveLength(1)
  })
})
