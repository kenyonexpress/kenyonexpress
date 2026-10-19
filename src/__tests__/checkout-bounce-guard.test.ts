import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ANY TOOL THAT NAVIGATES TO /checkout MUST PROVE WHERE IT LANDED.
 *
 * `src/app/(store)/checkout/page.tsx` sends an empty cart to `/cart`. Every
 * automated measurement in this repo runs with an empty cart unless it seeds
 * one, so a tool that requests `/checkout` and records the result under that
 * name is reporting the CART's numbers under checkout's label.
 *
 * That is not hypothetical. It happened twice:
 *
 *   scripts/lighthouse-sweep.mjs   CLS 0.357 was written up as "the one real
 *                                  defect, on the page where money changes
 *                                  hands" and ranked a high-severity launch
 *                                  risk. It was /cart's number.
 *   scripts/_touch-targets.mjs     the "90 violations at 380px" figure counted
 *                                  the cart's controls in the checkout row.
 *
 * Three other tools had already guarded it, in almost identical words -
 * compare.mjs refuses a checkout run that did not land on /checkout, and the
 * two Playwright specs seed a cart and assert the URL before asserting
 * anything else. The knowledge existed; it just was not enforced anywhere.
 *
 * Measuring the bounce is fine. Reporting it under the requested path is not.
 * THREE forms of proof satisfy this test, because there are three legitimate
 * ways to be right and a gate that accepts only one flags correct code:
 *
 *   1. seed the cart      no empty cart, so no redirect is possible. Every
 *                         purchase journey does this, and the content
 *                         assertions that follow would fail on the cart anyway.
 *   2. assert the URL     `expect(p.url()).toContain('/checkout')`, any handle.
 *                         compare.mjs uses `p`, not `page`.
 *   3. record it per row  a `finalPath` / `finalDisplayedUrl` field, for a probe
 *                         that legitimately measures whatever it reaches.
 */

const ROOTS = ['scripts', 'e2e'] as const

/**
 * Recorded gaps, not waivers.
 *
 * Both of these list `/checkout` among many routes and assert the same coarse
 * thing about each. Neither seeds, so both measure the CART under checkout's
 * name - which means checkout has no cover from either, and its entry passes by
 * testing a different page.
 *
 * They are listed rather than fixed here because the fix is a coverage
 * decision, not a bug fix: seeding a cart inside a route-loop spec changes what
 * those specs are, and both sit next to the purchase journeys. Recording them
 * keeps the gap visible; deleting the entry would hide it, and asserting the
 * URL would simply make them red.
 */
const RECORDED_GAPS = new Map([
  [
    'e2e/render-mode.spec.ts',
    'route loop asserting static vs dynamic rendering; the /checkout entry classifies /cart',
  ],
  [
    'e2e/smoke-all-routes.spec.ts',
    'route loop asserting a 200; /checkout bounces to /cart, which is also 200, so the row always passes',
  ],
])

/** Comments stripped: a file that only DISCUSSES /checkout is not visiting it. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function toolFiles(): string[] {
  const out: string[] = []
  for (const root of ROOTS) {
    const dir = resolve(process.cwd(), root)
    for (const entry of readdirSync(dir)) {
      if (/\.(mjs|ts)$/.test(entry) && !entry.endsWith('.test.mjs')) out.push(join(dir, entry))
    }
  }
  return out
}

/** Files whose executable code navigates to /checkout. */
const navigators = toolFiles().filter((file) => {
  const src = code(readFileSync(file, 'utf8'))
  return /['"`]\/checkout['"`]|['"`][^'"`]*\/checkout['"`]|goto\([^)]*checkout/i.test(src)
})

describe('tools that visit /checkout', () => {
  it('finds the ones that do, so this test cannot pass by matching nothing', () => {
    // If a refactor renames or moves these, this fails loudly rather than
    // quietly guarding an empty set - which is the failure mode of every
    // scanner in this repo that has ever gone wrong.
    expect(navigators.length).toBeGreaterThanOrEqual(3)
  })

  it.each(navigators.map((f) => relative(process.cwd(), f)))('%s proves where it landed', (rel) => {
    const src = code(readFileSync(resolve(process.cwd(), rel), 'utf8'))

    // A cart with something in it cannot bounce, so seeding IS the proof.
    // BUY_BUTTON is this repo's add-to-cart helper; the journeys import it.
    const seedsCart = /addToCart|addOpenProductToCart|seedCart|add-to-cart|BUY_BUTTON/i.test(src)
    // toHaveURL / waitForURL assert the landing URL more strongly than .url().
    const assertsUrl = /\w+\.url\(\)|toHaveURL|waitForURL/.test(src)
    const recordsFinal = /finalPath|finalDisplayedUrl|finalUrl/.test(src)

    // A recorded gap must still BE a gap. If one of these grows a proof, the
    // entry is stale and should go, so this fails rather than passing quietly.
    if (RECORDED_GAPS.has(rel)) {
      expect(
        seedsCart || assertsUrl || recordsFinal,
        `${rel} is listed in RECORDED_GAPS but now proves where it landed. Remove the entry.`,
      ).toBe(false)
      return
    }

    expect(
      seedsCart || assertsUrl || recordsFinal,
      `${rel} navigates to /checkout without seeding a cart, and an empty cart redirects to /cart. Seed the cart, assert the landing URL with .url(), or record finalPath on each row. Reporting the result under the requested path is how CLS 0.357 became a high-severity "checkout" risk that belonged to the cart.`,
    ).toBe(true)
  })
})
