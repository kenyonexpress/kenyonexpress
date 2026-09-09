#!/usr/bin/env node
/**
 * The build-blocking half of the i18n ratchet. `pnpm lint` runs it.
 * The rule is in `scripts/hebrew-literal-scan.mjs`, shared with
 * `src/lib/i18n/ratchet.test.ts`.
 *
 * Exit: 0 at or under the ceiling, 1 above it.
 */
import {
  HEBREW_LITERAL_CEILING,
  scanHebrewLiterals,
  totalHebrewLiterals,
} from './hebrew-literal-scan.mjs'

const total = totalHebrewLiterals()

if (total <= HEBREW_LITERAL_CEILING) {
  const slack = HEBREW_LITERAL_CEILING - total
  console.log(
    `i18n gate: clean (${total} Hebrew literals in scope, ceiling ${HEBREW_LITERAL_CEILING})${
      slack > 0 ? ` — lower HEBREW_LITERAL_CEILING to ${total}` : ''
    }`,
  )
  process.exit(0)
}

console.error(
  `i18n gate: ${total} Hebrew literals in scope, ${total - HEBREW_LITERAL_CEILING} over the ceiling of ${HEBREW_LITERAL_CEILING}\n`,
)
for (const row of scanHebrewLiterals().slice(0, 15)) {
  console.error(`  ${String(row.count).padStart(4)}  ${row.file}`)
}
console.error('\nA string a customer reads belongs in messages/he.json and is read through')
console.error("`t('key')` from src/lib/i18n/messages.ts. See docs/I18N.md.")
console.error('The ceiling only ever goes DOWN. If this rose because a whole area moved in')
console.error('scope, that is a decision to record in scripts/hebrew-literal-scan.mjs.')
process.exit(1)
