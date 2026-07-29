import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

/**
 * The rule this enforces: nothing on brand yellow may be white.
 *
 * White on #fed700 measures 1.41:1 against a 4.5:1 requirement. That is not a
 * near miss, it is illegible, and it was live in two places until 2026-07-29:
 * the header avatar button and the discount badge on every coupon card, which
 * is the one number that card exists to advertise.
 *
 * A source sweep rather than a rendered check, because it must fail in CI in
 * under a second and because the failure names the file. axe on a running page
 * would catch the same thing later, slower, and only on pages a test happens
 * to visit.
 */

const YELLOW = '#fed700'
const WHITE = '#ffffff'

/**
 * Classes that paint the brand YELLOW as a background.
 *
 * The trailing `(?![\w-])` is load-bearing. Without it `bg-brand` matches
 * inside `bg-brand-dark`, which is #333e48: white on that is correct and
 * flagging it made the first version of this test report 11 offenders of which
 * several were fine. A guard that cries wolf is a guard someone deletes.
 */
const YELLOW_BG = /\bbg-(?:brand|brand-primary|brand-secondary|primary)(?![\w-])/
/**
 * A colour pairing only matters WITHIN one variant.
 *
 * `bg-footer-bg text-white hover:bg-brand-secondary hover:text-heading` is
 * correct twice over: dark with white at rest, yellow with dark ink on hover.
 * A check that ignores the prefix reads it as "yellow and white in one class
 * list" and reports a violation that is not there.
 */
function classesFor(line: string, variant: '' | 'hover:'): string[] {
  return line
    .split(/[\s"'`{}]+/)
    .filter((c) => (variant === '' ? !c.includes(':') : c.startsWith('hover:')))
    .map((c) => c.replace(/^hover:/, ''))
}

const isYellowBg = (classes: string[]) =>
  classes.some((c) => /^bg-(?:brand|brand-primary|brand-secondary|primary)(?:\/\d+)?$/.test(c))

/** `text-white/70` is opacity, so still white. */
const isWhiteText = (classes: string[]) => classes.some((c) => /^text-white(?:\/\d+)?$/.test(c))

function tsxFiles(dir = 'src'): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path))
    else if (path.endsWith('.tsx')) out.push(path)
  }
  return out
}

/**
 * Only the class list matters, so comments are stripped first. Without this the
 * explanations added next to each fix ("white on brand yellow is 1.41:1") would
 * themselves trip the rule, and the honest fix would look like a violation.
 */
function stripComments(source: string): string {
  return (
    source
      // Newlines are PRESERVED, not collapsed. Removing a block comment outright
      // shifts every line number after it, which is how the first run of this
      // test blamed SiteFooter.tsx:205 for a violation that was 20 lines away.
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, '')
  )
}

describe('brand yellow never carries white text', () => {
  it('is worth enforcing: the ratio is 1.41:1', () => {
    expect(contrastRatio(WHITE, YELLOW)).toBeLessThan(1.5)
  })

  it('appears nowhere in src/', () => {
    const offenders: string[] = []

    for (const file of tsxFiles()) {
      const source = stripComments(readFileSync(file, 'utf8'))
      source.split('\n').forEach((line, i) => {
        // Both variants, independently. A resting yellow needs dark resting
        // text; a hover yellow needs dark hover text.
        for (const variant of ['', 'hover:'] as const) {
          const classes = classesFor(line, variant)
          if (isYellowBg(classes) && isWhiteText(classes)) {
            offenders.push(`${file}:${i + 1}${variant ? ' (hover)' : ''}`)
          }
        }
      })
    }

    expect(
      offenders,
      `white text on brand yellow (1.41:1, needs 4.5:1):\n  ${offenders.join('\n  ')}`,
    ).toHaveLength(0)
  })
})
