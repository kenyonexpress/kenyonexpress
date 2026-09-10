#!/usr/bin/env node
/**
 * AN INPUT THAT HOLDS LATIN TEXT OR A PHONE NUMBER NEEDS `dir`.
 *
 * The site is `dir="rtl"` at the root, so an `<input>` inherits RTL. Typing an
 * email or an Israeli mobile number into one is the classic bug on a Hebrew
 * site: the digits are bidi-neutral, so `050-1234567` can render with its
 * groups the wrong way round, the caret jumps as the user types, and a
 * placeholder like `you@example.com` sits right-aligned with its punctuation
 * displaced.
 *
 * MEASURED 2026-09-10: 19 inputs declare `type="tel"`, `type="email"` or
 * `type="url"`, and every one of them already carries `dir="ltr"` - somebody did
 * this carefully, one input at a time, and nothing was holding it. This is the
 * ratchet that keeps the twentieth correct, not a report of a defect.
 *
 * The rule is `dir` PRESENT rather than `dir="ltr"` exactly: `dir="auto"` is a
 * legitimate answer for a field that may hold either script, and hard-coding the
 * value here would push somebody towards the wrong one.
 *
 * FINDING THE END OF THE TAG IS THE WHOLE DIFFICULTY, and the first version got
 * it wrong in the direction that matters. Taking the first `>` after `<input`
 * stops at the arrow in `onChange={(e) => setEmail(...)}`, which cuts the element
 * in half and hides every attribute after it - so the one input the gate reported
 * was a correct input with `dir="ltr"` three lines below the cut. A gate that
 * fails on correct code teaches people to bypass it
 * (`src/__tests__/ci-gate-scope.test.ts` records the same lesson for the
 * typecheck gate), so the scan below tracks brace depth and quotes and ends the
 * tag at the first `>` that is actually a tag close.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, out)
    } else if (extname(entry) === '.tsx') {
      out.push(full)
    }
  }
  return out
}

const LATIN_TYPES = /type="(tel|email|url)"/

/**
 * The index just past the `>` that closes this tag, skipping the `>` of an arrow
 * function, of a string, and of anything nested in an expression container.
 */
function tagEnd(source, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (char === quote && source[i - 1] !== '\\') quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth++
    else if (char === '}') depth--
    else if (char === '>' && depth === 0 && source[i - 1] !== '=') return i + 1
  }
  return Math.min(source.length, start + 600)
}

const offenders = []
let checked = 0

for (const file of walk('src')) {
  if (/\.test\.tsx$/.test(file)) continue
  const source = readFileSync(file, 'utf8')

  for (const match of source.matchAll(/<(input|textarea)\b/g)) {
    const start = match.index ?? 0
    const element = source.slice(start, tagEnd(source, start))

    if (!LATIN_TYPES.test(element)) continue
    checked++
    if (!/\bdir=/.test(element)) {
      offenders.push(`${file}:${source.slice(0, start).split('\n').length}`)
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `input-dir gate: ${offenders.length} of ${checked} tel/email/url input(s) carry no dir\n`,
  )
  for (const offender of offenders) console.error(`  ${offender}`)
  console.error(
    '\nAdd dir="ltr" (or dir="auto" for a field that may hold either script). The page is RTL,\n' +
      'so without it an email or a phone number renders with its punctuation and digit groups\n' +
      'displaced, and the caret jumps while the customer types.',
  )
  process.exit(1)
}

console.log(`input-dir gate: clean (${checked} tel/email/url inputs, all carry dir)`)
