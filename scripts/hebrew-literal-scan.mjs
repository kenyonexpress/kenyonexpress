/**
 * THE i18n RATCHET: rendered Hebrew strings that are still literals in
 * components, counted per area, allowed to fall and never to rise.
 *
 * WHY A RATCHET AND NOT A BAN. [61] asks for "no literals in components".
 * Measured on 2026-09-09 before any of it was written: 1,292 rendered Hebrew
 * strings across 275 files. Extracting all of them in one change would be an
 * unreviewable diff across most of the UI, and an automated extraction produces
 * `common.string_417` keys, which is a catalog nobody can maintain and a
 * component nobody can read. A ratchet makes the remainder a MEASURED, FALLING
 * number instead of an open-ended intention.
 *
 * WHAT IS DELIBERATELY EXCLUDED, AND WHY EACH ONE IS A DECISION AND NOT A
 * BACKLOG ENTRY:
 *
 *   THE ADMIN PANEL - 499 of the 1,292, 39% of the total. A second language
 *   exists for SHOPPERS. The operator runs this shop in Hebrew, and translating
 *   the admin panel would double the catalog to serve nobody. If that ever
 *   changes it is its own decision with its own budget, not a leftover.
 *
 *   THE LEGAL PAGES - `app/(legal)/_content/*`. Israeli statute text and the
 *   site's own published terms. A translated copy is a SECOND legally binding
 *   document, and which of the two governs is then a question for a court
 *   rather than for a developer. The pages say in their own text that the
 *   Hebrew is the original.
 *
 *   THE LIVE-SITE FIXTURES - `ke-live-*` and `hero-singlefile-data.ts`. Verbatim
 *   records of what kenyonexpress.co.il renders, carrying measured geometry.
 *   They are a MEASUREMENT, not copy this site authors, and the copy gate
 *   already exempts the same files for the same reason.
 *
 *   TESTS, and anything already routed through `lib/i18n/messages.ts`.
 *
 * WHAT IT COUNTS is exactly what `latin-copy-scan.mjs` counts, with the script
 * inverted: a JSX text node, a copy-bearing attribute, or a copy-bearing object
 * key, whose value contains a Hebrew letter and looks like a sentence rather
 * than like code. Two callers, one definition of "a string a customer reads",
 * so the two gates cannot disagree about what copy is.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()

const SCANNED = ['src/components', 'src/app', 'src/lib', 'src/content']

/** Prefixes whose Hebrew is out of scope. Each is argued in the header. */
export const EXCLUDED_PREFIXES = [
  'src/app/(admin)/',
  'src/components/admin/',
  'src/app/(legal)/_content/',
  'src/app/debug/',
  'src/app/dev/',
]

export const EXCLUDED_FILES = new Set([
  'src/lib/ke-live-revslider-slides.ts',
  'src/lib/ke-live-deals-data.ts',
  'src/lib/ke-live-hero-data.ts',
  'src/lib/hero-singlefile-data.ts',
])

const COPY_KEYS =
  /\b(heading|title|title_secondary|standard_line|promo_small|promo_large|tagline|label|emojiLabel|placeholder|alt|caption|subtitle|cta|ctaLabel|buttonLabel|summary|blurb)\s*:\s*'([^']{2,})'/g

const COPY_ATTRS = /(?:aria-label|placeholder|alt|title)="([^"{}]{2,})"/g

const JSX_TEXT = />([^<>{}\n]{3,})</g

const SENTENCE_SHAPE = /^[\p{L}\p{N} ,.!?'’\-–—:&/₪%|·+]+$/u

const HEBREW = /[֐-׿]/

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

export function scannedFiles() {
  const out = []
  for (const dir of SCANNED) walk(resolve(ROOT, dir), out)
  return out.filter(
    (file) =>
      !EXCLUDED_FILES.has(file) && !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)),
  )
}

function collect(source, re, group) {
  const found = []
  re.lastIndex = 0
  let match = re.exec(source)
  while (match !== null) {
    const value = match[group]?.trim()
    if (value) found.push(value)
    match = re.exec(source)
  }
  return found
}

/** @returns {{file: string, count: number}[]} sorted by count, descending. */
export function scanHebrewLiterals(files = scannedFiles()) {
  const results = []
  for (const file of files) {
    const source = strip(readFileSync(resolve(ROOT, file), 'utf8'))
    const candidates = [
      ...collect(source, COPY_KEYS, 2),
      ...collect(source, COPY_ATTRS, 1),
      ...collect(source, JSX_TEXT, 1),
    ]
    const count = candidates.filter((text) => HEBREW.test(text) && SENTENCE_SHAPE.test(text)).length
    if (count > 0) results.push({ file, count })
  }
  return results.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
}

export function totalHebrewLiterals(files = scannedFiles()) {
  return scanHebrewLiterals(files).reduce((sum, row) => sum + row.count, 0)
}

/**
 * The ceiling. Lower it whenever a batch is extracted; never raise it.
 *
 * 2026-09-09, [61]: 1,292 rendered Hebrew strings across 275 files in the whole
 * tree. After the exclusions above, 703 were in scope. `SiteFooter` (27) and
 * `AccountNav` (14) were extracted into the catalog, leaving 662.
 *
 * The 589 difference between 1,292 and 703 is not a backlog. It is the admin
 * panel, the legal text and the live-site fixtures, and each is excluded for a
 * reason stated in this file's header rather than deferred.
 */
export const HEBREW_LITERAL_CEILING = 662
