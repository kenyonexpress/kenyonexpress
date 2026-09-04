#!/usr/bin/env node
/**
 * The build-blocking half of the Hebrew-copy rule. `pnpm lint` runs it, so an
 * English marketing sentence in a rendered component fails CI.
 *
 * The rule is in `scripts/latin-copy-scan.mjs`, shared with
 * `src/app/hebrew-copy.test.ts`. Two callers, one regex.
 *
 * Exit: 0 clean, 1 violations.
 */
import { formatLatinCopy, scanLatinCopy } from './latin-copy-scan.mjs'

const offenders = scanLatinCopy()

if (offenders.length === 0) {
  console.log('copy gate: clean (no Latin marketing sentence in a rendered component)')
  process.exit(0)
}

console.error(`copy gate: ${offenders.length} Latin-script string(s) a customer would read\n`)
console.error(formatLatinCopy(offenders))
console.error('\nEvery visible string is Hebrew. Where the live site has a Hebrew')
console.error('counterpart, use it; where live shows the Electro theme untranslated,')
console.error('write natural Hebrew. Brand and scheme names go in PHRASE_ALLOWLIST.')
process.exit(1)
