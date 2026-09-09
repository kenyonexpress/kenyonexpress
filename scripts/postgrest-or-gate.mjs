#!/usr/bin/env node
/**
 * The build-blocking half of the PostgREST `.or()` rule. `pnpm lint` runs it.
 * The rule is in `scripts/postgrest-or-scan.mjs`, shared with
 * `scripts/postgrest-or-gate.test.mjs`.
 *
 * Exit: 0 clean, 1 violations.
 */
import { formatPostgrestOr, scanPostgrestOr } from './postgrest-or-scan.mjs'

const offenders = scanPostgrestOr()

if (offenders.length === 0) {
  console.log(
    'postgrest-or gate: clean (every .or() interpolation is sanitized or session-derived)',
  )
  process.exit(0)
}

console.error(`postgrest-or gate: ${offenders.length} unsanitized .or() interpolation(s)\n`)
console.error(formatPostgrestOr(offenders))
console.error(
  '\n.or() takes a filter EXPRESSION, not a value: , ( ) " \\ % _ * are structural in it.',
)
console.error(
  "A search term containing a comma appends a condition of the caller's choosing, which",
)
console.error('changes which rows match on a query whose job is to decide what the caller may see.')
console.error('Pass it through sanitizeOrTerm (src/lib/utils/search-escape.ts) first.')
process.exit(1)
