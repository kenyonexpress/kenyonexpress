import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BASELINE_WIDTHS,
  DEFAULT_BASELINES,
  defaultBaselineFor,
  recaptureHint,
} from './parity-baseline.mjs'

describe('defaultBaselineFor', () => {
  it('gives a bare home run the Electro v7 capture', () => {
    expect(defaultBaselineFor('home')).toBe('refs/electro_v7_{width}.png')
  })

  it('lets an explicit capture win over the default', () => {
    expect(defaultBaselineFor('home', { livePng: 'refs/ke_live_{width}.png' })).toBe(
      'refs/ke_live_{width}.png',
    )
  })

  it('does not swap a capture in for a URL the caller named', () => {
    expect(defaultBaselineFor('home', { live: 'https://example.test/' })).toBeNull()
  })

  it('has no default for cart and checkout, which have no capture', () => {
    expect(defaultBaselineFor('cart')).toBeNull()
    expect(defaultBaselineFor('checkout')).toBeNull()
  })

  it('keeps the width placeholder in every default, or --widths refuses two of three', () => {
    for (const path of Object.values(DEFAULT_BASELINES)) expect(path).toContain('{width}')
  })

  it('captures exactly the widths the gate is quoted at', () => {
    expect(BASELINE_WIDTHS).toEqual([380, 768, 1440])
  })
})

describe('recaptureHint', () => {
  it('names the script for the capture that script writes, and only that one', () => {
    expect(recaptureHint('refs/electro_v7_380.png')).toBe(
      'node scripts/capture-electro-baseline.mjs',
    )
    expect(recaptureHint('refs/electro_product_380.png')).toBeNull()
  })
})

describe('compare.mjs', () => {
  // The module is only a default if the gate reads it. Resolved from cwd:
  // import.meta.url is not a file URL under this test environment.
  const source = readFileSync(resolve(process.cwd(), 'scripts/compare.mjs'), 'utf8')

  it('takes its frozen capture from defaultBaselineFor', () => {
    expect(source).toContain("from './parity-baseline.mjs'")
    expect(source).toMatch(/const LIVE_PNG =\s+defaultBaselineFor\(page,/)
  })
})
