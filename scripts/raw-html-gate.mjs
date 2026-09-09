#!/usr/bin/env node
/**
 * The build-blocking half of the raw-HTML rule. `pnpm lint` runs it.
 * The rule is in `scripts/raw-html-scan.mjs`, shared with
 * `scripts/raw-html-gate.test.mjs`.
 *
 * Exit: 0 clean, 1 violations.
 */
import { formatRawHtml, scanRawHtml } from './raw-html-scan.mjs'

const offenders = scanRawHtml()

if (offenders.length === 0) {
  console.log('raw-html gate: clean (every dangerouslySetInnerHTML is jsonLdScript or allowlisted)')
  process.exit(0)
}

console.error(`raw-html gate: ${offenders.length} unreviewed dangerouslySetInnerHTML value(s)\n`)
console.error(formatRawHtml(offenders))
console.error('\nInterpolating request-derived text into __html is stored XSS. Catalogue copy is')
console.error('authored in the admin panel, so a template literal here is reachable from a form.')
console.error('Serialize JSON-LD with jsonLdScript(); render everything else as React children.')
console.error('A genuine module constant goes in SAFE_CONSTANTS in scripts/raw-html-scan.mjs,')
console.error('which is a line in a diff somebody reads.')
process.exit(1)
