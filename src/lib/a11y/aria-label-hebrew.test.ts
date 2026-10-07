import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY ACCESSIBLE NAME THE CODE WRITES IS HEBREW. STEP 32, 2026-10-07.
 *
 * The document is `lang="he"`, so a screen reader speaks every name with the
 * Hebrew voice. An English `aria-label="Close"` on a Hebrew page is not read
 * as English: it is read letter by letter, or mangled by the Hebrew voice, and
 * the control it names becomes a guess. The copy gate (`scripts/copy-gate.mjs`)
 * only catches TWO OR MORE consecutive Latin words, by design, so a one-word
 * English label passes it. This test closes that gap for the attributes that
 * are a control's name and nothing else.
 *
 * Measured before writing: 160 literal and 45 computed `aria-label`s under
 * src/, all already Hebrew. This is the ratchet that keeps it so, not a sweep
 * that found something. It reads the source rather than the rendered tree
 * because the rendered names are the e2e suite's job (`e2e/a11y.spec.ts`,
 * "every control is named in Hebrew") and this one has to run in `pnpm test`
 * on every commit with no browser.
 *
 * Shapes covered:
 *   aria-label="..."                       the literal
 *   aria-label={`... ${x} ...`}             the template's literal parts
 *   aria-label={cond ? '...' : '...'}       every quoted string in the braces
 *   aria-label={NAME}                       a same-file `const NAME = '...'`
 *   aria-roledescription / aria-description the same way
 * A value that is a bare expression (`{label}`, `{product.name_he}`) is a
 * runtime string and is left to the e2e tree check.
 */

const ATTRS = ['aria-label', 'aria-roledescription', 'aria-description']
const HEBREW = /\p{Script=Hebrew}/u

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Strings a name may legitimately be without a Hebrew letter. */
function exempt(value: string): boolean {
  const v = value.trim()
  if (v === '') return true
  // Digits, punctuation and currency only: a page number, a price, a date.
  if (/^[\d\s\-+.,:/%₪()]+$/.test(v)) return true
  return false
}

type Offence = { file: string; attr: string; value: string }

/** How many names the scan actually judged, so a broken regex cannot pass as "clean". */
let judged = 0

function scan(file: string): Offence[] {
  const src = strip(readFileSync(file, 'utf8'))
  const out: Offence[] = []
  const bad = (attr: string, value: string) => {
    judged += 1
    if (!exempt(value) && !HEBREW.test(value)) out.push({ file, attr, value })
  }
  for (const attr of ATTRS) {
    // aria-label="..."
    for (const m of src.matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))) bad(attr, m[1] as string)
    // aria-label={...} up to the matching brace on the same line (templates may span lines)
    for (const m of src.matchAll(new RegExp(`${attr}=\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`, 'g'))) {
      const expr = m[1] as string
      if (expr.startsWith('`')) {
        // Template: judge the literal parts, with every ${...} removed.
        const literal = expr.slice(1, expr.lastIndexOf('`')).replace(/\$\{[^}]*\}/g, '')
        bad(attr, literal)
        continue
      }
      const quoted = [...expr.matchAll(/'([^']*)'|"([^"]*)"/g)].map((q) => (q[1] ?? q[2]) as string)
      if (quoted.length > 0) {
        for (const q of quoted) bad(attr, q)
        continue
      }
      // A bare identifier: resolve a same-file string constant if there is one.
      const ident = expr.trim()
      if (/^[A-Z_][A-Z0-9_]*$/.test(ident)) {
        const def = src.match(new RegExp(`const ${ident}\\s*=\\s*'([^']*)'`))
        if (def) bad(attr, def[1] as string)
      }
    }
  }
  return out
}

describe('accessible names written in source are Hebrew', () => {
  const files = walk('src')

  it('scans a corpus large enough to mean something', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('finds no Latin-only or empty-literal aria-label, aria-roledescription or aria-description', () => {
    const offences = files.flatMap(scan)
    expect(
      offences.map((o) => `${o.file}: ${o.attr}="${o.value}"`),
      'a control named in a language the Hebrew voice cannot read',
    ).toEqual([])
    // 146 judged on 2026-10-07 (the rest of the 205 attributes are bare
    // expressions); a regex that matches nothing would report "clean" with
    // the same empty array.
    expect(judged, 'the scan judged too few names to be trusted').toBeGreaterThan(120)
  })

  it('does not exempt an English word by accident', () => {
    expect(exempt('Close')).toBe(false)
    expect(exempt('2')).toBe(true)
    expect(exempt('₪ 1,200')).toBe(true)
    expect(HEBREW.test('סגירה')).toBe(true)
  })
})
