import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every rendered image carries an `alt`. WCAG 1.1.1, which Israeli standard
 * 5568 adopts.
 *
 * `alt=""` is allowed and is not an oversight: it is the correct markup for a
 * decorative image, and it tells a screen reader to skip it rather than read a
 * filename. What is not allowed is the attribute being ABSENT, which makes
 * assistive tech fall back to announcing the URL.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is the whole difficulty. This codebase
 * discusses `<img>` and `<Image>` in prose constantly -- the optimizer-vs-raw-tag
 * decision is documented at length in CouponCard, HeroSlider and
 * CategoryProductCard. A naive scan reports SEVEN violations on this tree and
 * every one of them is a sentence in a comment. A check that cries wolf seven
 * times is a check nobody runs.
 */
const SRC = resolve(process.cwd(), 'src')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full))
    else if (/\.(tsx|jsx)$/.test(entry) && !entry.includes('.test.')) out.push(full)
  }
  return out
}

/** Block and line comments out, so only real markup is scanned. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line))
    .join('\n')
}

describe('every image has an alt attribute', () => {
  const offenders: string[] = []

  for (const file of tsxFiles(SRC)) {
    const code = stripComments(readFileSync(file, 'utf8'))
    for (const match of code.matchAll(/<(Image|img)\b((?:[^>]|\n)*?)\/?>/g)) {
      if (/\balt\s*=/.test(match[0])) continue
      const line = code.slice(0, match.index).split('\n').length
      offenders.push(`${file.replace(`${process.cwd()}/`, '')}:${line} <${match[1]}>`)
    }
  }

  it('finds no image without one', () => {
    expect(offenders, `images missing alt:\n${offenders.join('\n')}`).toHaveLength(0)
  })

  it('actually scans a meaningful number of files', () => {
    // A guard on the guard. If the walker or the regex breaks, the test above
    // passes vacuously and reports a clean audit of nothing.
    expect(tsxFiles(SRC).length).toBeGreaterThan(50)
  })
})
