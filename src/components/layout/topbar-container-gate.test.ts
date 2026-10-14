import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE TOP BAR'S CONTAINER AND TYPE ARE A CONTRACT ACROSS THREE FILES (UX02,
 * 14.10.2026), in the same shape as the greeting gate next to this one.
 *
 * `tokens.css` declares the three Bootstrap container widths and the 13.006px
 * type; `globals.css` applies the widths at Bootstrap's stops (576 / 768 /
 * 992 / 1200, none of which is a Tailwind breakpoint); `TopBar.tsx` carries
 * the class and the utility. Any one of the three can be tidied by a reader
 * who sees an unused-looking token, a media query with one consumer, or a
 * class with no Tailwind definition, and the site keeps building while the
 * bar slides back to x15 at 768 and 14.864px type.
 *
 * Source-reading on purpose: `renderToStaticMarkup` cannot see a media
 * query. What the rendered bar does at the five widths is `e2e/topbar.spec.ts`.
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('top bar container and type gate, three files that must agree', () => {
  const tokens = read('src/styles/tokens.css')
  const globals = read('src/app/globals.css')
  const topBar = read('src/components/layout/TopBar.tsx')

  it('tokens.css declares the Bootstrap container stops and the 13.006px type', () => {
    expect(tokens).toMatch(/--container-topbar-sm:\s*540px;/)
    expect(tokens).toMatch(/--container-topbar-md:\s*720px;/)
    expect(tokens).toMatch(/--container-topbar-lg:\s*960px;/)
    expect(tokens).toMatch(/--container-page:\s*1200px;/)
    // .929em of live's 14px body, pinned in px so our 16px body cannot leak in.
    expect(tokens).toMatch(/--text-topbar:\s*13\.006px;/)
  })

  it('globals.css applies each width at its Bootstrap stop, and the page width at 1200', () => {
    const stop = (min: number, token: string) =>
      new RegExp(
        `@media \\(min-width: ${min}px\\) \\{\\s*\\.topbar-container \\{\\s*max-width: var\\(${token}\\);\\s*\\}\\s*\\}`,
      )
    expect(globals).toMatch(/\.topbar-container \{\s*max-width: 100%;\s*\}/)
    expect(globals).toMatch(stop(576, '--container-topbar-sm'))
    expect(globals).toMatch(stop(768, '--container-topbar-md'))
    expect(globals).toMatch(stop(992, '--container-topbar-lg'))
    expect(globals).toMatch(stop(1200, '--container-page'))
    // Four stops, no fifth: a 1480 rule would widen the bar past the masthead
    // on a page no gate measures.
    expect([...globals.matchAll(/\.topbar-container \{/g)]).toHaveLength(5)
  })

  it('TopBar carries the class and the token, and nothing from the old pair', () => {
    expect(topBar).toMatch(/className="topbar-container [^"]*\btext-topbar\b[^"]*"/)
    // Strip comments first: the file explains in prose what it no longer
    // renders, and a raw grep would report the fix as the violation.
    const code = topBar
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code, 'max-w-page puts the 768 items at x15').not.toMatch(/\bmax-w-page\b/)
    expect(code, 'an em off our 16px body renders 14.864px').not.toMatch(/text-\[0?\.929em\]/)
    expect(code, 'live darkens on hover, it does not fade').not.toMatch(/hover:opacity/)
    expect(code).toMatch(/hover:text-heading-hover/)
  })

  it('the hover colour is mirrored in tokens.ts and tokens.css as live’s #29323a', () => {
    const ts = read('src/styles/tokens.ts')
    expect(ts).toMatch(/headingHover:\s*'#29323a'/)
    expect(ts).toMatch(/'--color-heading-hover':\s*SITE\.functional\.headingHover/)
    expect(tokens).toMatch(/--color-heading-hover:\s*#29323a;/)
  })
})
