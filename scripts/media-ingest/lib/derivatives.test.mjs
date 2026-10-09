import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DERIVATIVES,
  cacheComplete,
  cachePath,
  deriveAll,
  extOf,
  idOf,
  mimeOf,
} from './derivatives.mjs'

const HASH = 'a'.repeat(64)

describe('the derivative family', () => {
  it('matches the 06-media-sync cache layout, byte for byte in the names', () => {
    // The August dry-run cache under wp_import/media is the only copy of 66
    // images whose origin died. These filenames are the contract with it.
    const names = DERIVATIVES.map((d) => `${HASH}${d.suffix}.${extOf(d)}`)
    expect(names).toEqual([
      `${HASH}.webp`,
      `${HASH}.card.webp`,
      `${HASH}.thumb.webp`,
      `${HASH}.og.webp`,
      `${HASH}.og.jpg`,
    ])
  })

  it('gives og.webp and og.jpg distinct identities', () => {
    expect(new Set(DERIVATIVES.map(idOf)).size).toBe(DERIVATIVES.length)
    expect(DERIVATIVES.map(mimeOf)).toContain('image/jpeg')
  })
})

describe('deriveAll against a cache', () => {
  let dir
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'media-ingest-derive-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const fillCache = () => {
    for (const d of DERIVATIVES) writeFileSync(cachePath(dir, HASH, d), Buffer.from(idOf(d)))
  }

  it('serves a complete cache without original bytes', async () => {
    fillCache()
    expect(cacheComplete(dir, HASH)).toBe(true)

    const derived = await deriveAll(dir, HASH, null)

    expect(Object.keys(derived).sort()).toEqual(DERIVATIVES.map(idOf).sort())
    expect(derived['main.webp'].buffer).toEqual(Buffer.from('main.webp'))
  })

  it('refuses an incomplete cache when there are no original bytes to convert', async () => {
    expect(cacheComplete(dir, HASH)).toBe(false)
    await expect(deriveAll(dir, HASH, null)).rejects.toThrow(/no original bytes/)
  })

  it('converts real bytes through sharp and caches every derivative', async () => {
    const sharp = (await import('sharp')).default
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer()

    const derived = await deriveAll(dir, HASH, png)

    expect(derived['main.webp'].width).toBe(32) // withoutEnlargement: 32px stays 32px
    expect(readdirSync(dir)).toHaveLength(DERIVATIVES.length)
    // the og pair is a hard 1200x630 cover crop, but never enlarged past source
    expect(derived['.og.webp'].buffer.length).toBeGreaterThan(0)
  })
})
