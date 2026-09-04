/**
 * THE RAW-VALUE SCANNER: one rule, two callers.
 *
 * `src/styles/tokens.test.ts` runs it so a raw colour fails `pnpm test`, and
 * `scripts/tokens-gate.mjs` runs it so the same thing fails `pnpm lint`, which
 * is what CI blocks a merge on. Both read this file; there is no second copy of
 * the regex to drift.
 *
 * WHY IT EXISTS AT ALL, AND WHY IT SCANS `.ts`. The hex rule this replaces
 * lived inside tokens.test.ts and walked `.tsx` only. That was the whole hole:
 *
 *   - `HERO_SLIDER_BG = '#eef4f7'` painted the largest block on the homepage
 *     from a `.ts` constant, applied as an inline backgroundColor;
 *   - the two email builders carried seven literals each, and their yellow had
 *     already drifted from the site's once;
 *   - three more transactional emails (abandoned cart, weekly digest,
 *     newsletter confirm) shipped a BLACK call-to-action in system-ui, so the
 *     brand simply was not in them;
 *   - `pass-model.ts` wrote the wallet red twice, as hex and as rgb(), under a
 *     comment claiming it was the colour the site is measured against -- which
 *     is #dc3545, a different red.
 *
 * Every one of those is a `.ts` file, and the gate that exists to prevent
 * exactly them could not see any of it.
 *
 * WHAT IT DOES NOT DO. It does not read comments: provenance notes are the
 * reason the tokens are trustworthy and they quote the values they explain.
 * And it skips tests, which assert exact colours by their nature.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()

/** `#abc`, `#aabbcc`, `#aabbccdd` -- but not the `&#8217;` of an HTML entity. */
const HEX_RE = /(?<!&)#[0-9a-fA-F]{3,8}\b/g
const RGB_RE = /\brgba?\(\s*\d[^)]*\)/g
/** A Tailwind arbitrary length: `px-[15px]`, `max-w-[534px]`, `-start-[9999px]`. */
const ARBITRARY_PX_RE = /\[-?\d+(?:\.\d+)?px\]/g

/**
 * Files allowed to name a colour, each for a stated reason.
 *
 * THE DEFINITION LAYER. These five ARE the tokens, or are a verbatim dump of
 * the reference the tokens were measured from. A rule that forbids a hex in the
 * file whose job is to declare hexes is a rule that only ever fires falsely.
 *
 * `ke-live-hero-data.ts` earns its place narrowly: the two rgb() strings in it
 * are `KE_LIVE_HERO.dots`, a measured record of the live slider's dots that NO
 * component imports -- the colour that actually paints them is
 * `--color-slider-dot-idle` in tokens.css. If anything ever renders from this
 * object, the value has to move into the palette first.
 *
 * THE TWO COMPONENTS. GoogleLogo reproduces Google's mark to their branding
 * guidelines and is deliberately not ours to tokenise -- a KenyonExpress
 * rebrand must leave it alone. global-error.tsx renders when the root layout
 * itself threw, which includes the stylesheet failing to load, so it cannot
 * reference a custom property for the same reason it supplies its own <html>.
 */
export const COLOUR_ALLOWLIST = new Set([
  'src/styles/tokens.ts',
  'src/lib/category-tokens.ts',
  'src/lib/electro-hero-tokens.ts',
  'src/lib/ke-live-revslider-slides.ts',
  'src/lib/ke-live-hero-data.ts',
  'src/components/shared/GoogleLogo.tsx',
  'src/app/global-error.tsx',
])

/**
 * Files allowed to write an arbitrary px length, each for a stated reason.
 *
 * HeroSlider carries the live Revolution Slider's display ramp: ~33 sizes and
 * offsets that appear once each, on one element, in one component, and that
 * were read off the reference together. `tokens.css` already promoted the four
 * that had two call sites; promoting the rest would put thirty single-use
 * numbers in the global theme, which makes the theme harder to read and changes
 * nothing about where they are edited. The rule is "a value with two call sites
 * is a token", and these have one.
 *
 * BarSeries is admin analytics chrome: `gap-[2px]` between chart bars, with no
 * live counterpart to measure and no second use.
 */
export const PX_ALLOWLIST = new Set([
  'src/components/home/HeroSlider.tsx',
  'src/components/admin/analytics/BarSeries.tsx',
])

/** Strip block and line comments, so documentation may quote what it explains. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(relative(ROOT, full))
    }
  }
  return out
}

/** Every scannable source file under `src/`, repo-relative. */
export function sourceFiles(root = resolve(ROOT, 'src')) {
  return walk(root)
}

/**
 * @returns {{file: string, kind: 'hex'|'rgb'|'px', value: string}[]} every
 * violation, in file order, so the message a developer reads is stable.
 */
export function scanRawValues(files = sourceFiles()) {
  const offenders = []
  for (const file of files) {
    const source = code(readFileSync(resolve(ROOT, file), 'utf8'))
    if (!COLOUR_ALLOWLIST.has(file)) {
      for (const value of source.match(HEX_RE) ?? []) offenders.push({ file, kind: 'hex', value })
      for (const value of source.match(RGB_RE) ?? []) offenders.push({ file, kind: 'rgb', value })
    }
    if (!PX_ALLOWLIST.has(file) && file.endsWith('.tsx')) {
      for (const value of source.match(ARBITRARY_PX_RE) ?? []) {
        offenders.push({ file, kind: 'px', value })
      }
    }
  }
  return offenders
}

export function formatOffenders(offenders) {
  return offenders.map((o) => `  ${o.file}: ${o.value} (${o.kind})`).join('\n')
}
