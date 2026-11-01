import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE HOME-ONLY GREETING IS A CONTRACT ACROSS THREE FILES, and nothing else
 * held it together.
 *
 * `TopBar.tsx` renders "ברוך הבא לעולם של קניון Express" with the class
 * `topbar-greeting` and `hidden`. `src/app/(store)/page.tsx` renders an inert
 * `<div data-home hidden />`. `globals.css` joins the two with
 * `body:has([data-home]) .topbar-greeting { display: flex }`. Any one of the
 * three can be "cleaned up" by a reader who sees a hidden span, an empty div,
 * or a CSS rule with no obvious consumer, and the site keeps building, keeps
 * passing `TopBar.test.tsx`, and quietly loses the one top-bar row that makes
 * home 113px tall at 380 against 76 on an inner page.
 *
 * The contract exists because the alternative -- `usePathname()` in the shared
 * header -- opts every route under it into dynamic rendering and fails the
 * build on unrelated prerendered pages (MobileDrawer.tsx records the trap).
 * So the last assertion here is that nobody has reached for it.
 *
 * Source-reading on purpose: `renderToStaticMarkup` cannot see a CSS rule,
 * and the page component pulls the catalogue. What the rendered bar does at
 * the three widths is `e2e/topbar.spec.ts`.
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('top bar greeting gate, three files that must agree', () => {
  it('TopBar renders the greeting hidden under the class the stylesheet targets', () => {
    const src = read('src/components/layout/TopBar.tsx')
    expect(src).toContain('ברוך הבא לעולם של קניון Express')
    expect(src).toMatch(/className="topbar-greeting hidden[^"]*"/)
  })

  it('globals.css reveals it only inside a body that carries the home marker', () => {
    const css = read('src/app/globals.css')
    const rule = css.match(/body:has\(\[data-home\]\)\s*\.topbar-greeting\s*\{([^}]*)\}/)
    expect(rule, 'the :has() rule is the only thing that shows the greeting').not.toBeNull()
    expect(rule?.[1]).toMatch(/display:\s*flex/)
    // One rule, not two. A second selector on `.topbar-greeting` that sets
    // display would either show it everywhere or fight the gate.
    const displaySetters = [...css.matchAll(/\.topbar-greeting[^{]*\{[^}]*display:/g)]
    expect(displaySetters).toHaveLength(1)
  })

  it('the home page, and only the home page, renders the marker', () => {
    const home = read('src/app/(store)/page.tsx')
    expect(home).toMatch(/<div data-home hidden \/>/)

    const carriers = walk(join(ROOT, 'src/app'))
      .filter((file) => /data-home\b/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(ROOT.length + 1))
    expect(
      carriers,
      'a second [data-home] anywhere under src/app would put the greeting on that route too',
    ).toEqual(['src/app/(store)/page.tsx'])
  })

  it('no layout component reads the pathname to do the same job', () => {
    const layoutDir = join(ROOT, 'src/components/layout')
    // The import, not the call: MobileDrawer.tsx and RegionMenu.tsx both
    // mention `usePathname()` in the comment that explains why they avoid it.
    const imported = /import\s*\{[^}]*\busePathname\b[^}]*\}\s*from\s*['"]next\/navigation['"]/
    const offenders = walk(layoutDir)
      .filter((file) => imported.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(ROOT.length + 1))
    expect(
      offenders,
      'usePathname() in the shared shell turns every prerendered route dynamic',
    ).toEqual([])
  })
})
