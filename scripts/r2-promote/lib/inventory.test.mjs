import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv, parseDotEnv } from './env.mjs'
import {
  LOCAL_CDN_PREFIX,
  PLACEHOLDER_SECRET,
  PROXY_BASE,
  contentTypeFor,
  credentialState,
  dedupe,
  ledgerObjects,
  liveAssetObjects,
  productImageObjects,
  publicBaseFor,
  rewriteSql,
  summarize,
} from './inventory.mjs'

let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'r2-promote-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const file = (rel, bytes = 'x') => {
  const full = join(root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, bytes)
  return full
}

const REAL = {
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
}

describe('credentialState', () => {
  it('is ok with the four real values, under either bucket name', () => {
    expect(credentialState(REAL).ok).toBe(true)
    const { R2_BUCKET: _, ...rest } = REAL
    expect(credentialState({ ...rest, R2_BUCKET_NAME: 'bucket' }).ok).toBe(true)
  })

  it('names what is missing', () => {
    const s = credentialState({ R2_ACCOUNT_ID: 'acc' })
    expect(s.ok).toBe(false)
    expect(s.missing).toEqual([
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET (or R2_BUCKET_NAME)',
    ])
  })

  it('refuses the harness placeholder even though every variable is "set"', () => {
    // The state measured on the Vercel project on 2026-10-06: present and useless.
    const env = Object.fromEntries(Object.keys(REAL).map((k) => [k, PLACEHOLDER_SECRET]))
    const s = credentialState(env)
    expect(s.ok).toBe(false)
    expect(s.missing).toEqual([])
    expect(s.placeholders).toEqual([
      'R2_ACCESS_KEY_ID',
      'R2_ACCOUNT_ID',
      'R2_BUCKET',
      'R2_SECRET_ACCESS_KEY',
    ])
  })
})

describe('publicBaseFor', () => {
  it('uses the public domain when there is one', () => {
    expect(publicBaseFor({ R2_PUBLIC_BASE_URL: 'https://cdn.example.test/' })).toBe(
      'https://cdn.example.test',
    )
  })

  it('falls back to the signed proxy route, never to an r2.dev guess', () => {
    expect(publicBaseFor({ R2_ACCOUNT_ID: 'acc' })).toBe(PROXY_BASE)
    expect(publicBaseFor({ R2_PUBLIC_BASE_URL: PLACEHOLDER_SECRET })).toBe(PROXY_BASE)
    expect(PROXY_BASE).toBe('/images/r2')
  })
})

describe('ledgerObjects', () => {
  it('takes only locally stored ingested rows and dedupes shared keys', () => {
    file('wp/ab/abc.webp')
    file('wp/ab/abc.card.webp')
    const rows = [
      {
        status: 'ingested',
        storage: 'local',
        public_url: '/images/cdn/wp/ab/abc.webp',
        card_url: '/images/cdn/wp/ab/abc.card.webp',
        thumb_url: null,
      },
      // A second source URL that hashed to the same bytes: same keys.
      { status: 'ingested', storage: 'local', public_url: '/images/cdn/wp/ab/abc.webp' },
      { status: 'ingested', storage: 'r2', public_url: 'https://cdn/x.webp' },
      { status: 'unreachable', public_url: '/images/cdn/wp/zz/never.webp' },
      { status: 'ingested', storage: 'local', public_url: '/images/cdn/wp/cd/missing.webp' },
    ]
    const r = ledgerObjects({ rows, localRoot: root })
    expect(r.localRows).toBe(3)
    expect(r.objects.map((o) => o.key)).toEqual(['wp/ab/abc.webp', 'wp/ab/abc.card.webp'])
    expect(r.objects[0]).toMatchObject({ source: 'cdn', bytes: 1, contentType: 'image/webp' })
    expect(r.missing).toEqual(['wp/cd/missing.webp'])
  })
})

describe('productImageObjects', () => {
  it('keys every file under the directory by its relative path', () => {
    file('products/b7.avif')
    file('products/nested/x.webp', 'abcd')
    const r = productImageObjects({ dir: join(root, 'products') })
    expect(r.objects.map((o) => [o.key, o.bytes, o.contentType])).toEqual([
      ['products/b7.avif', 1, 'image/avif'],
      ['products/nested/x.webp', 4, 'image/webp'],
    ])
  })

  it('is empty, not an error, for a directory that does not exist', () => {
    expect(productImageObjects({ dir: join(root, 'nope') }).objects).toEqual([])
  })
})

describe('liveAssetObjects', () => {
  it('skips quarantined and errored assets and reports missing derivatives', () => {
    file('live/a.jpg')
    file('live/_derived/a.380.webp')
    const manifest = {
      assets: [
        {
          path: 'a.jpg',
          derivatives: [
            { width: 380, format: 'webp' },
            { width: 768, format: 'avif' },
          ],
        },
        { path: 'electro.png', quarantined: true },
        { path: 'gone.png', error: '404' },
        { path: 'listed-only.png' },
      ],
    }
    const r = liveAssetObjects({ manifest, root: join(root, 'live') })
    expect(r.objects.map((o) => o.key)).toEqual(['live-assets/a.jpg', 'live-assets/a.380.webp'])
    expect(r.missing).toEqual(['_derived/a.768.avif', 'listed-only.png'])
    expect(r.quarantined).toBe(1)
  })
})

describe('dedupe and summarize', () => {
  it('keeps the first of a repeated key and totals per source', () => {
    const objs = dedupe([
      { source: 'cdn', key: 'a', bytes: 10 },
      { source: 'products', key: 'b', bytes: 5 },
      { source: 'cdn', key: 'a', bytes: 99 },
    ])
    expect(objs).toHaveLength(2)
    expect(summarize(objs)).toEqual({
      count: 2,
      bytes: 15,
      bySource: { cdn: { count: 1, bytes: 10 }, products: { count: 1, bytes: 5 } },
    })
  })
})

describe('contentTypeFor', () => {
  it('maps the extensions the sets contain and falls back to octet-stream', () => {
    expect(contentTypeFor('x.AVIF')).toBe('image/avif')
    expect(contentTypeFor('x.jpeg')).toBe('image/jpeg')
    expect(contentTypeFor('x.bin')).toBe('application/octet-stream')
  })
})

describe('rewriteSql', () => {
  it('rewrites one whole array element per promoted product file and prefix-swaps the ledger', () => {
    const sql = rewriteSql({
      base: '/images/r2/',
      bucket: 'kenyon',
      productKeys: ["products/it's.webp", 'products/a.webp', 'wp/aa/not-a-product.webp'],
    })
    // Sorted, quoted, and pinned to a whole jsonb element by the surrounding quotes.
    expect(sql).toContain(
      `update public.products set images = replace(images::text, '"/images/products/a.webp"', '"/images/r2/products/a.webp"')::jsonb`,
    )
    expect(sql).toContain(`'"/images/products/it''s.webp"'`)
    expect(sql).not.toContain('not-a-product')
    expect(sql.indexOf('products/a.webp')).toBeLessThan(sql.indexOf("it''s"))
    expect(sql).toContain(`storage = 'r2', bucket = 'kenyon'`)
    expect(sql).toContain(`replace(public_url, '${LOCAL_CDN_PREFIX}', '/images/r2/')`)
    expect(sql).toContain(`where storage = 'local' and public_url like '${LOCAL_CDN_PREFIX}%'`)
    expect(sql).toContain(`update public.media_assets set url = replace(url, '${LOCAL_CDN_PREFIX}'`)
  })

  it('carries no transaction wrapper, so a BEGIN/ROLLBACK rehearsal around it holds', () => {
    const sql = rewriteSql({ base: 'https://cdn.example.test', bucket: 'b' })
    expect(sql).not.toMatch(/\b(BEGIN|COMMIT)\b/i)
  })
})

describe('parseDotEnv / loadEnv', () => {
  it('strips quotes, comments and export, and keeps the shell environment on top', () => {
    const parsed = parseDotEnv(
      [
        '# comment',
        'export R2_ACCOUNT_ID="acc"',
        "R2_ACCESS_KEY_ID='key'",
        'R2_SECRET_ACCESS_KEY=secret # trailing comment',
        'R2_BUCKET=',
        'not a line',
      ].join('\n'),
    )
    expect(parsed).toEqual({
      R2_ACCOUNT_ID: 'acc',
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: '',
    })

    const envFile = file('.env.local', 'R2_BUCKET="from-file"\nR2_ACCOUNT_ID="file-acc"\n')
    const merged = loadEnv({ file: envFile, env: { R2_BUCKET: 'from-shell' } })
    expect(merged).toEqual({ R2_BUCKET: 'from-shell', R2_ACCOUNT_ID: 'file-acc' })
    expect(loadEnv({ file: join(root, 'missing'), env: { A: '1' } })).toEqual({ A: '1' })
  })
})
