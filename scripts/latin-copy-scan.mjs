/**
 * THE HEBREW-COPY GATE: no Latin-script marketing sentence in a rendered
 * component.
 *
 * WHY. KenyonExpress is a Hebrew storefront built on the Electro template, and
 * the template's demo copy kept shipping: "SHOP THE HOTTEST PRODUCTS", "CATCH
 * BIG DEALS ON THE CONSOLES", "LAPTOPS NOTEBOOKS AND MORE", "SIMPLY THE BEST",
 * "THE NEW STANDARD", "PREMIUM PRODUCT" and three "Shop now" buttons -- above
 * the fold, on the homepage, in a language the customer does not shop in. Two
 * of those sentences also advertised a product line this store does not carry.
 *
 * It survived every review because nothing was looking for it. The live site
 * runs the same theme and shows the same English, so the pixel comparison
 * scored it as correct.
 *
 * WHAT COUNTS AS MARKETING COPY. Text a visitor reads: a JSX text node, and the
 * value of a copy-bearing field (`heading`, `title`, `label`, `tagline`,
 * `alt`, `placeholder`, ...). Not identifiers, not class names, not URLs, not
 * types -- those are Latin by necessity and no reader sees them.
 *
 * WHAT COUNTS AS A VIOLATION. Two or more consecutive Latin words. A single
 * Latin word inside Hebrew is ordinary in Israeli commerce ("קורסים Express",
 * "הזן כתובת Email") and is not what this rule is about.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()

/** Directories whose files render something a customer reads. */
const SCANNED = ['src/components', 'src/app', 'src/lib', 'src/content']

/**
 * Files exempt, each for a stated reason.
 *
 * The two `ke-live-*` modules left here are verbatim dumps of the live site's own
 * markup, kept so measurements and the pixel comparison describe one page. Their
 * English is a RECORD of what live shows, not copy this site renders -- the
 * slides the homepage actually paints are in `hero-singlefile-data.ts`, which is
 * scanned. The legal content is Israeli statute text that quotes English
 * scheme names.
 */
const FILE_ALLOWLIST = new Set([
  'src/lib/ke-live-revslider-slides.ts',
  'src/lib/ke-live-deals-data.ts',
  // A developer-only route behind /debug, not linked from anywhere a customer
  // reaches. Its three buttons name the Next.js constructs they throw from --
  // "Server Action", "Server Component", "Route Handler" -- which are API
  // names, not copy, and translating them would make the page useless to the
  // person it exists for.
  'src/app/debug/sentry/page.tsx',
])

/**
 * Latin phrases that are allowed to appear, and why.
 *
 * Brand and scheme names are not translated: a payment mark reads "American
 * Express" or it is not that mark. `Kenyon Express` is this company's own name.
 * The rest are proper nouns and product names that exist only in Latin script.
 */
const PHRASE_ALLOWLIST = [
  'Kenyon Express',
  'KenyonExpress',
  'American Express',
  'Apple Pay',
  'Google Pay',
  'Google Analytics',
  'Air Port City',
  'Tel Aviv',
  'Service Worker',
]

const COPY_KEYS =
  /\b(heading|title|title_secondary|standard_line|promo_small|promo_large|tagline|label|emojiLabel|placeholder|alt|caption|subtitle|cta|ctaLabel|buttonLabel|summary|blurb)\s*:\s*'([^']{2,})'/g

/** `aria-label="..."`, `placeholder="..."`, `alt="..."` in JSX. */
const COPY_ATTRS = /(?:aria-label|placeholder|alt|title)="([^"{}]{2,})"/g

/**
 * A JSX text node: between `>` and `<`, on ONE line, with no braces or tags.
 *
 * The single-line restriction is what makes this usable. Without it the same
 * pattern matches across a TypeScript generic and the code after it --
 * `useState>(null)\n  const [busy, setBusy] = ...` reads as a "text node" and
 * every `React.forwardRef<...>` in the tree comes back as marketing copy. 129
 * false positives on the first run, and not one true one among them.
 */
const JSX_TEXT = />([^<>{}\n]{3,})</g

/**
 * A candidate has to look like a sentence, not like code.
 *
 * Letters, digits, spaces and the punctuation prose uses. A candidate carrying
 * a bracket, an equals sign, a semicolon or a backtick is an expression that
 * happened to sit between two angle brackets.
 */
const SENTENCE_SHAPE = /^[\p{L}\p{N} ,.!?'’\-–—:&\/₪%|·+]+$/u

/** Two or more consecutive Latin words. */
const LATIN_PHRASE = /[A-Za-z][A-Za-z'’]+(?:[  ]+[A-Za-z][A-Za-z'’]+)+/

function strip(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
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

export function copyFiles() {
  const out = []
  for (const dir of SCANNED) walk(resolve(ROOT, dir), out)
  return out.filter((f) => !FILE_ALLOWLIST.has(f))
}

function allowed(text) {
  let rest = text
  for (const phrase of PHRASE_ALLOWLIST) rest = rest.split(phrase).join(' ')
  return !LATIN_PHRASE.test(rest)
}

function collect(source, re, group) {
  const found = []
  re.lastIndex = 0
  let m = re.exec(source)
  while (m !== null) {
    const value = m[group]?.trim()
    if (value) found.push(value)
    m = re.exec(source)
  }
  return found
}

/** @returns {{file: string, text: string}[]} */
export function scanLatinCopy(files = copyFiles()) {
  const offenders = []
  for (const file of files) {
    const source = strip(readFileSync(resolve(ROOT, file), 'utf8'))
    const candidates = [
      ...collect(source, COPY_KEYS, 2),
      ...collect(source, COPY_ATTRS, 1),
      ...collect(source, JSX_TEXT, 1),
    ]
    for (const text of candidates) {
      if (!SENTENCE_SHAPE.test(text)) continue
      if (!LATIN_PHRASE.test(text)) continue
      if (allowed(text)) continue
      offenders.push({ file, text: text.slice(0, 90) })
    }
  }
  return offenders
}

export function formatLatinCopy(offenders) {
  return offenders.map((o) => `  ${o.file}: "${o.text}"`).join('\n')
}
