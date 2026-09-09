#!/usr/bin/env node
/**
 * The build-blocking half of the RTL logical-property rule. `pnpm lint` runs it.
 * The rule is in `scripts/rtl-logical-scan.mjs`, shared with
 * `scripts/rtl-logical-gate.test.mjs`.
 *
 * Exit: 0 clean, 1 violations.
 */
import { formatRtlLogical, scanRtlLogical } from './rtl-logical-scan.mjs'

const offenders = scanRtlLogical()

if (offenders.length === 0) {
  console.log('rtl-logical gate: clean (no physical direction utility outside an LTR island)')
  process.exit(0)
}

console.error(`rtl-logical gate: ${offenders.length} physical direction utility(ies)\n`)
console.error(formatRtlLogical(offenders))
console.error('\nThe document is dir="rtl", so mr-2 and ms-2 render the same today. They stop')
console.error('rendering the same the moment the subtree is flipped, and the physical one is')
console.error('the one that then means something nobody intended.')
console.error('\n  ml -> ms      mr -> me      pl -> ps      pr -> pe')
console.error('  text-left -> text-start      text-right -> text-end')
console.error('  (in an RTL document text-right IS text-start; check which you mean)')
console.error('\nIf the element carries dir="ltr" the physical spelling is CORRECT and the scan')
console.error('already allows it. If it is a corner pin rather than a text flow, add it to')
console.error('REVIEWED in scripts/rtl-logical-scan.mjs with the argument.')
process.exit(1)
