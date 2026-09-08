import { describe, expect, it } from 'vitest'
import { BUDGET_GZ_BYTES, ROUTES, isRouteJs, verdict } from './measure-route-js.mjs'

describe('isRouteJs', () => {
  // The first run of this script counted a 22.4 KB stylesheet as JavaScript,
  // because Turbopack writes CSS into /_next/static/chunks/ alongside the JS
  // and the filter tested the directory. These four cases are that bug.
  it('excludes CSS that lives in the chunks directory', () => {
    expect(isRouteJs('http://x/_next/static/chunks/44jyoy3xfxvlr.css')).toBe(false)
  })

  it('accepts JS in the chunks directory', () => {
    expect(isRouteJs('http://x/_next/static/chunks/1mhawd-ho2xee.js')).toBe(true)
  })

  it('accepts JS carrying a cache-busting query', () => {
    expect(isRouteJs('http://x/_next/static/chunks/a.js?v=2')).toBe(true)
  })

  it('excludes third-party scripts that happen to end in .js', () => {
    // These 404 locally and cost 0 bytes, so counting them is invisible here
    // and only surfaces as a vendor's bytes inside an app-code budget in
    // production.
    expect(isRouteJs('http://x/_vercel/insights/script.js')).toBe(false)
    expect(isRouteJs('https://cdn.example.com/tag.js')).toBe(false)
  })

  it('excludes documents, fonts and images', () => {
    for (const url of ['http://x/cart', 'http://x/f/heebo.woff2', 'http://x/a.png']) {
      expect(isRouteJs(url)).toBe(false)
    }
  })
})

describe('verdict', () => {
  it('passes exactly at the budget and fails one byte over', () => {
    expect(verdict(BUDGET_GZ_BYTES)).toBe('PASS')
    expect(verdict(BUDGET_GZ_BYTES + 1)).toBe('FAIL')
  })
})

describe('what the script covers', () => {
  // scripts/bundle-gate.mjs measures rootMainFiles + polyfills -- the shared
  // floor every route pays. It says in its own header that Turbopack emits no
  // app-build-manifest.json, so per-route sums are not available to it. This
  // script exists to measure the part the gate cannot see, so its route list
  // has to include the funnel the budget is written about.
  it('covers the routes STEP 14 budgets', () => {
    expect(ROUTES).toContain('/')
    expect(ROUTES).toContain('/cart')
    expect(ROUTES).toContain('/checkout')
  })

  it('states the budget in bytes, not a rounded KB float', () => {
    expect(BUDGET_GZ_BYTES).toBe(184320)
    expect(Number.isInteger(BUDGET_GZ_BYTES)).toBe(true)
  })
})
