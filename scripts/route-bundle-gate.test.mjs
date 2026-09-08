import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUDGETS_FILE, htmlPathFor, measureRoute, ownChunkUrls } from './route-bundle-gate.mjs'

const budgets = JSON.parse(readFileSync(BUDGETS_FILE, 'utf8'))

describe('htmlPathFor', () => {
  it('maps the root to index.html, not to an empty name', () => {
    expect(htmlPathFor('/')).toBe('.next/server/app/index.html')
  })

  it('maps a named route to its prerendered file', () => {
    expect(htmlPathFor('/checkout')).toBe('.next/server/app/checkout.html')
  })
})

describe('ownChunkUrls', () => {
  it("takes this build's static JS", () => {
    const html = '<script src="/_next/static/chunks/a.js"></script>'
    expect(ownChunkUrls(html)).toEqual(['/_next/static/chunks/a.js'])
  })

  it('leaves out CSS that sits in the same directory', () => {
    const html = '<link href="/_next/static/chunks/a.css"><script src="/_next/static/chunks/b.js">'
    expect(ownChunkUrls(html)).toEqual(['/_next/static/chunks/b.js'])
  })

  it('leaves out third-party scripts', () => {
    // Vercel's insights scripts are served from /_vercel, not /_next/static.
    // They are real bytes in production and they are not this repository's code.
    const html =
      '<script src="/_vercel/insights/script.js"></script><script src="/_next/static/chunks/b.js">'
    expect(ownChunkUrls(html)).toEqual(['/_next/static/chunks/b.js'])
  })

  it('counts a chunk named twice once', () => {
    const html = '<script src="/_next/static/chunks/a.js"><script src="/_next/static/chunks/a.js">'
    expect(ownChunkUrls(html)).toHaveLength(1)
  })
})

describe('measureRoute refuses to report a number it does not have', () => {
  // The failure this guards is the one this project keeps finding: a gate that
  // reports success while measuring nothing. A route with no prerendered HTML,
  // or one naming a chunk that is not on disk, must come back null and fail the
  // run -- not come back 0 and pass it.
  it('returns null, not zero, for a route with no prerendered HTML', () => {
    const r = measureRoute('/definitely-not-a-route-in-this-app')
    expect(r.bytes).toBeNull()
    expect(r.reason).toBe('not prerendered')
  })
})

describe('the budgets file', () => {
  it('covers the routes STEP 14 budgets', () => {
    for (const route of ['/', '/cart', '/checkout']) {
      expect(Object.keys(budgets.routes)).toContain(route)
    }
  })

  it('records the spec target it is not yet meeting', () => {
    expect(budgets.specTargetKb).toBe(180)
    for (const kb of Object.values(budgets.routes)) expect(kb).toBeGreaterThan(budgets.specTargetKb)
  })

  it('says in the file why the ratchet is above the target', () => {
    expect(budgets.note).toMatch(/owner decision/)
    expect(budgets.note).toMatch(/PERF-REPORT/)
  })
})
