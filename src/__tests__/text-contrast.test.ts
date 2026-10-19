import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AA, contrastRatio, flattenAlpha } from '@/lib/a11y/contrast'
import { describe, expect, it } from 'vitest'

/**
 * EVERY FADED TEXT COLOUR, CHECKED AGAINST WCAG AA, BY ARITHMETIC.
 *
 * `text-heading/60` is `#333e48` at 60% over white, which is `#858b91`, which
 * is 3.44:1. AA wants 4.5:1 for normal text. Five call sites were below the
 * line, one of them the small print under the supplier lead form and one the
 * placeholder in its inputs at 2.14:1.
 *
 * WHY IT SURVIVED. The a11y suite catches it - it is one axe run - but the E2E
 * job in CI has never executed: `CI_SUPABASE_URL` is unset, so the job warns
 * "E2E skipped", skips the test step, and reports SUCCESS. A green job that
 * runs no tests is why an arithmetic defect on a public page lasted. This test
 * needs no browser and no database, so it runs in the suite that does run.
 *
 * The comparison is against WHITE because that is the page background these
 * utilities appear on. A token used on a dark surface would need its own entry
 * here rather than a blanket exemption - there are none today.
 *
 * The maths is `@/lib/a11y/contrast`, which already had it. The first draft of
 * this file reimplemented luminance and the ratio, which would have been the
 * eighteenth private copy of a shared calculation in this repo - the same
 * duplication the comment-stripper module was extracted to end. `flattenAlpha`
 * is the one piece that was genuinely missing, and it lives there now.
 */

const SRC = resolve(process.cwd(), 'src')

/** `--color-heading: #333e48;` -> heading: #333e48 */
function tokenColours(): Map<string, string> {
  const css = readFileSync(resolve(SRC, 'styles/tokens.css'), 'utf8')
  const out = new Map<string, string>()
  for (const [, name, hex] of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (name && hex) out.set(name, hex.toLowerCase())
  }
  return out
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Every `text-<token>/<opacity>` in the app, with where it was written. */
function fadedTextUsages(): { file: string; token: string; alpha: number; utility: string }[] {
  const found: { file: string; token: string; alpha: number; utility: string }[] = []
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8')
    for (const [utility, token, pct] of source.matchAll(
      /(?:placeholder:)?text-([a-z0-9-]+)\/(\d+)/g,
    )) {
      found.push({
        file: file.slice(SRC.length + 1),
        token: token ?? '',
        alpha: Number(pct) / 100,
        utility: utility ?? '',
      })
    }
  }
  return found
}

describe('faded text meets WCAG AA on white', () => {
  const colours = tokenColours()
  // The page background, read from the same token file rather than written as a
  // literal - the token gate forbids a raw hex under src/, and rightly: a
  // hard-coded white here would keep asserting after the background changed.
  const background = colours.get('background') ?? ''
  const usages = fadedTextUsages().filter((u) => colours.has(u.token))

  it('found the utilities to check, so a rename cannot empty this test', () => {
    expect(usages.length).toBeGreaterThan(20)
  })

  it('read the page background out of the tokens', () => {
    expect(background).toMatch(/^#[0-9a-f]{6}$/)
  })

  it.each([...new Set(usages.map((u) => `${u.token}/${Math.round(u.alpha * 100)}`))].sort())(
    '%s is readable',
    (combo) => {
      const [token, pct] = combo.split('/')
      const hex = colours.get(token ?? '') ?? '#000000'
      const painted = flattenAlpha(hex, Number(pct) / 100, background)
      const ratio = contrastRatio(painted, background)
      const where = usages
        .filter((u) => `${u.token}/${Math.round(u.alpha * 100)}` === combo)
        .map((u) => u.file)
      expect(
        Number(ratio.toFixed(2)),
        `${combo} paints ${painted} on white = ${ratio.toFixed(2)}:1, below ${AA.normal}:1. Used in: ${[...new Set(where)].join(', ')}`,
      ).toBeGreaterThanOrEqual(AA.normal)
    },
  )
})
