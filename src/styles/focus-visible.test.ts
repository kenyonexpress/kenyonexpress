import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A CONTROL THAT KILLS ITS OUTLINE MUST DRAW SOMETHING ELSE.
 *
 * `outline: none` on `:focus` is the single most common way a site becomes
 * unusable by keyboard, and axe cannot catch it: WCAG 2.4.7 Focus Visible is
 * not machine-detectable, so the axe suite next door passes a page whose focus
 * ring has been deleted.
 *
 * WHAT THIS FOUND WHEN IT WAS WRITTEN. Two rules, the cart coupon field and
 * every checkout input, set `outline: none` and left `border-color: #fed700` as
 * the only indicator. That border is 1.41:1 against the white field, where
 * WCAG 1.4.11 asks 3:1 of a focus indicator, and the `#ddd` border it replaces
 * is 1.36 -- so the change a keyboard user was meant to notice was a shift
 * between two values both invisible on white. On the checkout, which is the
 * form with money at the end of it.
 *
 * THE RULE: any CSS block that removes the outline must be accompanied by a
 * `:focus-visible` rule for the same selector that draws one. The Tailwind side
 * is covered by the same idea in a different spelling, `focus:outline-none`
 * paired with a `ring-`, and is asserted here too because both spellings ship
 * the same defect.
 */

const STYLES_DIR = resolve(process.cwd(), 'src/styles')
const SRC_DIR = resolve(process.cwd(), 'src')

function filesUnder(dir: string, ext: readonly string[]): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(full, ext))
    else if (ext.some((e) => entry.name.endsWith(e))) found.push(full)
  }
  return found
}

/** The selector a `:focus { outline: none }` block belongs to. */
function selectorsRemovingOutline(css: string): string[] {
  const out: string[] = []
  const blocks = css.matchAll(/([^{}]+)\{([^}]*)\}/g)
  for (const block of blocks) {
    const selector = (block[1] ?? '').trim()
    const body = block[2] ?? ''
    if (!/outline:\s*(none|0)\b/.test(body)) continue
    out.push(selector)
  }
  return out
}

describe('a removed focus outline is always replaced', () => {
  const cssFiles = filesUnder(STYLES_DIR, ['.css']).map((file) => ({
    path: relative(process.cwd(), file),
    css: readFileSync(file, 'utf8'),
  }))

  it('reads the stylesheets at all', () => {
    // Guard on the guard: a walk that finds nothing passes everything below.
    expect(cssFiles.length).toBeGreaterThan(5)
    expect(cssFiles.map((f) => f.path)).toContain('src/styles/checkout-page.css')
  })

  it('gives every outline-killing rule a focus-visible ring in the same file', () => {
    const offenders: string[] = []

    for (const { path, css } of cssFiles) {
      const removals = selectorsRemovingOutline(css)
      if (removals.length === 0) continue

      // The replacement does not have to be on the same selector string, only
      // present for the same control, so the check is per file: a stylesheet
      // that kills an outline must also declare a focus-visible outline.
      const declaresRing = /:focus-visible[^{]*\{[^}]*outline:\s*(?!none|0)/.test(css)
      if (!declaresRing) offenders.push(`${path} (${removals.join(', ')})`)
    }

    expect(
      offenders,
      `these stylesheets set outline:none on focus and never draw a focus-visible ring, which deletes the keyboard indicator axe cannot see:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('leaves no Tailwind focus:outline-none without a ring near it', () => {
    // A WINDOW, NOT A LINE, and the first draft of this used a line. That
    // version flagged twelve places and every one was a false positive: a
    // className split across lines puts `ring-` on a different line from
    // `outline-none`, and a gate that cries wolf is a gate somebody deletes.
    //
    // `tabIndex={-1}` is exempt and that is the interesting exemption. The
    // skip-link target is `<main tabIndex={-1} className="focus:outline-none">`:
    // it is focusable only programmatically, never by Tab, and it is focused
    // BY the skip link. Drawing a ring around the entire page body at that
    // moment is noise, not an affordance. Suppressing it there is correct.
    const WINDOW = 300
    const offenders: string[] = []

    for (const file of filesUnder(SRC_DIR, ['.tsx'])) {
      const source = readFileSync(file, 'utf8')
      if (file.endsWith('.test.tsx')) continue
      let from = 0
      for (;;) {
        const at = source.indexOf('outline-none', from)
        if (at === -1) break
        from = at + 1
        const near = source.slice(Math.max(0, at - WINDOW), at + WINDOW)
        // `focus:bg-` counts. shadcn's menu items are `outline-none
        // focus:bg-accent`: the indicator is a background change, which is a
        // perfectly visible focus affordance and not a ring. Five of the eight
        // this flagged on its second draft were exactly that, and treating them
        // as defects would have been the same crying-wolf mistake as the first.
        const replaced =
          /ring-|outline-\[|focus-visible|tabIndex=\{-1\}|focus:bg-|data-\[highlighted\]:bg-/.test(
            near,
          )
        if (!replaced) {
          offenders.push(`${relative(process.cwd(), file)} around index ${at}`)
        }
      }
    }

    expect(
      offenders,
      `these remove the focus outline with no ring, no focus-visible rule and no tabIndex={-1} anywhere near them:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
