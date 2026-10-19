import { describe, expect, it } from 'vitest'
import { LOCAL_ONLY, loadShortfall } from './load-shortfall.mjs'

const fail = (type, url) => ({ type, url })
const VERCEL = 'http://localhost:3311/_vercel/insights/script.js'
const SPEED = 'http://localhost:3311/_vercel/speed-insights/script.js'
const UPGRADED = 'https://localhost:3311/login?next=%2Faccount%2Fwishlist'

describe('loadShortfall', () => {
  it('says so plainly when nothing failed', () => {
    expect(loadShortfall([])).toBe('everything loaded')
  })

  it('counts by resource type, commonest first', () => {
    const line = loadShortfall([
      fail('font', 'https://gone.example/a.woff2'),
      fail('script', 'https://gone.example/a.js'),
      fail('script', 'https://gone.example/b.js'),
    ])
    expect(line).toBe('3 failed to load (2 script, 1 font)')
  })

  // The reference, measured. The number this replaces called all 96 fonts.
  it('names scripts separately from fonts, which is the correction it exists for', () => {
    const failures = [
      ...Array.from({ length: 57 }, (_, i) => fail('script', `https://gone.example/${i}.js`)),
      ...Array.from({ length: 37 }, (_, i) => fail('font', `https://gone.example/${i}.woff2`)),
      fail('stylesheet', 'https://gone.example/a.css'),
      fail('xhr', 'https://gone.example/admin-ajax.php'),
    ]
    expect(loadShortfall(failures)).toBe(
      '96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr)',
    )
  })

  describe('our own side on a local origin', () => {
    it('reports the expected ones as expected rather than as failures', () => {
      const line = loadShortfall([
        fail('script', VERCEL),
        fail('script', VERCEL),
        fail('script', SPEED),
        fail('script', SPEED),
        fail('fetch', UPGRADED),
      ])
      expect(line).toBe('5 failed to load, all expected on a local origin')
    })

    // The whole point of separating them: five and six must not read the same.
    it('shows a real failure standing among the expected ones', () => {
      const line = loadShortfall([
        fail('script', VERCEL),
        fail('fetch', UPGRADED),
        fail('image', 'http://localhost:3311/images/hero.webp'),
      ])
      expect(line).toBe('1 failed to load (1 image), plus 2 expected on a local origin')
    })

    it('does not excuse a real /_vercel path that is not the insights script', () => {
      expect(loadShortfall([fail('script', 'http://localhost:3311/_vercel/other.js')])).toBe(
        '1 failed to load (1 script)',
      )
    })

    it('does not excuse an https URL on a host that is not localhost', () => {
      expect(loadShortfall([fail('fetch', 'https://kenyonexpress.co.il/a')])).toBe(
        '1 failed to load (1 fetch)',
      )
    })
  })

  it('keeps the local-only list short enough to read', () => {
    expect(LOCAL_ONLY.length).toBeLessThan(5)
  })
})
