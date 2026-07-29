// Parser tests for the WXR and CSV readers.
//
// These run against `fixtures/sample.wxr.xml`, which is built to contain the
// shapes a real export contains and a naive parser gets wrong: a Hebrew slug
// that is percent-encoded, a category tree whose parent is named by slug, a
// gallery id with no attachment item, a term an item references that the
// preamble never declared, and CDATA holding markup.

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv, readWooCsv, readWxr } from './wxr.mjs'

// Resolved from the vitest root rather than import.meta.url: the jsdom
// environment hands these modules an http:// base, which fileURLToPath rejects.
const FIXTURE = resolve(process.cwd(), 'scripts/wp-import/fixtures/sample.wxr.xml')

const read = () => readWxr(FIXTURE)

describe('readWxr: taxonomy', () => {
  it('reads product_cat terms and leaves product_tag out of the tree', async () => {
    const { categories } = await read()
    expect(categories.map((c) => c.slug).sort()).toEqual(['restaurants', 'sushi'])
  })

  it('resolves a parent named by slug into the parent term id', async () => {
    const { categories } = await read()
    const restaurants = categories.find((c) => c.slug === 'restaurants')
    const sushi = categories.find((c) => c.slug === 'sushi')

    // WXR names the parent by slug; public.categories needs an id. A root term
    // is 0, not null, because that is the shape 02-transform reads.
    expect(restaurants.parent).toBe(0)
    expect(sushi.parent).toBe(restaurants.id)
    expect(sushi.id).toBe(22)
  })

  it('decodes entities in term names and descriptions', async () => {
    const { categories } = await read()
    const restaurants = categories.find((c) => c.slug === 'restaurants')
    expect(restaurants.name).toBe('מסעדות')
    expect(restaurants.description).toBe('כל המסעדות & בתי הקפה')
  })

  it('counts products per category from the items, not from the export header', async () => {
    const { categories } = await read()
    // 101 is the only product in sushi; restaurants holds only the draft 103.
    expect(categories.find((c) => c.slug === 'sushi').count).toBe(1)
    expect(categories.find((c) => c.slug === 'restaurants').count).toBe(1)
  })
})

describe('readWxr: items', () => {
  it('splits items by post_type and skips the rest', async () => {
    const { products, attachments, itemsSeen, counts } = await read()
    expect(products).toHaveLength(4) // 101, 102, 103, 104
    expect(attachments).toHaveLength(2) // 900, 901
    expect(itemsSeen).toBe(6)
    expect(counts.skipped).toBe(0)
  })

  it('keeps the percent-encoded Hebrew slug verbatim for the redirect map', async () => {
    const { products } = await read()
    const meal = products.find((p) => p.id === 101)
    // Decoding belongs to the transform stage. If the reader decoded here, the
    // old URL that is actually indexed would be lost and no 301 could be built.
    expect(meal.slug).toBe('%d7%90%d7%a8%d7%95%d7%97%d7%94-%d7%96%d7%95%d7%92%d7%99%d7%aa')
    expect(meal.permalink).toContain('/product/%d7%90')
  })

  it('reads prices and sku out of postmeta', async () => {
    const { products } = await read()
    const meal = products.find((p) => p.id === 101)
    expect(meal.regular_price).toBe('250')
    expect(meal.sale_price).toBe('189.90')
    expect(meal.price).toBe('189.90')
    expect(meal.sku).toBe('KE-MEAL-2')
    expect(meal.stock_status).toBe('instock')
  })

  it('collects every _wp_old_slug, because each one is still indexed', async () => {
    const { products } = await read()
    const meal = products.find((p) => p.id === 101)
    expect(meal.old_slugs).toEqual(['meal-for-two', 'dinner-deal'])
  })

  it('carries CDATA content through without losing the markup', async () => {
    const { products } = await read()
    const meal = products.find((p) => p.id === 101)
    expect(meal.description).toContain('<p>')
    expect(meal.description).toContain('קינוח')
    expect(meal.short_description).toBe('ארוחה זוגית במסעדה')
  })

  it('preserves post status so the transform can exclude drafts and trash', async () => {
    const { products } = await read()
    expect(products.find((p) => p.id === 103).status).toBe('draft')
    expect(products.find((p) => p.id === 104).status).toBe('trash')
  })

  it('splits terms by taxonomy on the item too', async () => {
    const { products } = await read()
    const meal = products.find((p) => p.id === 101)
    expect(meal.category_ids).toEqual([22])
    expect(meal.tag_names).toEqual(['חם'])
  })
})

describe('readWxr: partial exports are reported, not silently dropped', () => {
  it('records a category the item names but the preamble never declared', async () => {
    const { products } = await read()
    const noPrice = products.find((p) => p.id === 102)
    // A product with no category appears in no listing, so this has to be
    // countable before import rather than discovered afterwards.
    expect(noPrice.category_ids).toEqual([])
    expect(noPrice._wxr.unresolved_categories).toEqual(['ghost-category'])
  })

  it('records a gallery id with no attachment item', async () => {
    const { products } = await read()
    expect(products.find((p) => p.id === 102)._wxr.missing_attachments).toEqual([999])
    // 902 is listed in 101's gallery but never exported.
    expect(products.find((p) => p.id === 101)._wxr.missing_attachments).toEqual([902])
  })
})

describe('readWxr: media resolution', () => {
  it('resolves thumbnail and gallery ids to attachment urls, thumbnail first', async () => {
    const { products } = await read()
    const meal = products.find((p) => p.id === 101)
    expect(meal.images.map((i) => i.src)).toEqual([
      'https://kenyonexpress.co.il/wp-content/uploads/2024/03/meal.jpg',
      'https://kenyonexpress.co.il/wp-content/uploads/2024/03/side.jpg',
    ])
    expect(meal.images.map((i) => i.position)).toEqual([0, 1])
    expect(meal.images[0].alt).toBe('ארוחה זוגית מוגשת')
  })

  it('tolerates a trailing comma in the gallery id list', async () => {
    // `_product_image_gallery` is `901,902,` in the fixture. A naive split
    // yields an empty id, which becomes NaN and then a null image row.
    const { products } = await read()
    expect(products.find((p) => p.id === 101).images.every((i) => i.src)).toBe(true)
  })

  it('reads the attachment relative path and url', async () => {
    const { attachments } = await read()
    const meal = attachments.find((a) => a.id === 900)
    expect(meal.relative_path).toBe('2024/03/meal.jpg')
    expect(meal.parent_id).toBe(101)
  })
})

describe('parseCsv', () => {
  it('handles quoted commas, embedded newlines and doubled quotes', () => {
    const rows = parseCsv('a,b\n"x,1","he said ""hi""\nsecond line"\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,1', 'he said "hi"\nsecond line'],
    ])
  })

  it('accepts CRLF and strips the BOM Excel writes', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('readWooCsv', () => {
  const csv = [
    'ID,Type,SKU,Name,Published,Regular price,Sale price,Categories,Images,Meta:_wp_old_slug',
    '55,simple,KE-1,ארוחה,1,250,189.90,"מסעדות > סושי, מבצעים",https://x/a.jpg,old-one',
    '56,simple,,טיוטה,0,90,,מסעדות,,',
  ].join('\n')

  it('builds a category tree out of the "Parent > Child" path', () => {
    const { categories, products } = readWooCsv(csv)
    const parent = categories.find((c) => c.name === 'מסעדות')
    const child = categories.find((c) => c.name === 'סושי')
    expect(child.parent).toBe(parent.id)
    expect(parent.parent).toBe(0)
    // The row declares two paths, so the product lands in the leaf of each.
    expect(products[0].category_ids).toHaveLength(2)
  })

  it('maps published flag to status and derives the price', () => {
    const { products } = readWooCsv(csv)
    expect(products[0].status).toBe('publish')
    expect(products[0].price).toBe('189.90')
    expect(products[1].status).toBe('draft')
    expect(products[1].price).toBe('90')
  })

  it('leaves slug null so the transform derives it the way WordPress did', () => {
    // The CSV exporter has no slug column at all. Inventing one here would
    // produce a slug that never existed and a redirect pointing nowhere.
    expect(readWooCsv(csv).products[0].slug).toBeNull()
  })

  it('keeps Meta: columns as meta_data', () => {
    const { products } = readWooCsv(csv)
    expect(products[0].meta_data).toContainEqual({ key: '_wp_old_slug', value: 'old-one' })
  })

  it('warns about columns it ignored rather than dropping them silently', () => {
    const { warnings } = readWooCsv('ID,Name,Whatever\n1,x,y\n')
    expect(warnings.join()).toContain('Whatever')
  })

  it('returns a warning and no products for a header-only export', () => {
    const { products, warnings } = readWooCsv('ID,Name\n')
    expect(products).toEqual([])
    expect(warnings.join()).toContain('no data rows')
  })
})
