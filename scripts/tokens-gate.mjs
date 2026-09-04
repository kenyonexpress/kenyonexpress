#!/usr/bin/env node
/**
 * The build-blocking half of the raw-value rule. `pnpm lint` runs it, so a raw
 * colour or an arbitrary px length fails CI the same way a lint error does.
 *
 * The rule itself is in `scripts/raw-value-scan.mjs`, shared with
 * `src/styles/tokens.test.ts`. Two callers, one regex, no drift.
 *
 * Exit: 0 clean, 1 violations.
 */
import { formatOffenders, scanRawValues } from './raw-value-scan.mjs'

const offenders = scanRawValues()

if (offenders.length === 0) {
  console.log('tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)')
  process.exit(0)
}

console.error(`tokens gate: ${offenders.length} raw value(s) outside the token layer\n`)
console.error(formatOffenders(offenders))
console.error('\nA colour belongs in src/styles/tokens.ts and is used through the Tailwind')
console.error('utility its --color-* property generates. A length that has a second call')
console.error('site belongs in tokens.css as --spacing-*/--text-*/--radius-*.')
process.exit(1)
