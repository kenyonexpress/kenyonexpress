#!/usr/bin/env node
/**
 * A CEILING ON HARDCODED `'he-IL'`, AND WHY IT IS A CEILING RATHER THAN A SWEEP.
 *
 * `src/lib/i18n/format.ts` exists to be the one place this site decides what a
 * date, a number and a percentage look like. Its own header records the
 * measurement that justified it: 130 call sites reached `toLocaleDateString`,
 * `toLocaleString` or `Intl.*` directly, 123 of them spelling `'he-IL'` inline,
 * and several already disagreed - some pass
 * `{ day: 'numeric', month: 'long', year: 'numeric' }`, some pass nothing at all
 * and render `9.9.2026`, and the two sit on adjacent pages.
 *
 * MEASURED 2026-09-10: the module has **one production consumer**
 * (`app/(admin)/admin/subscriptions/page.tsx`) and its own test, against **142
 * inline `'he-IL'` occurrences in 83 files**. It was written, documented, tested,
 * and then not adopted - the shape this project keeps finding, and the reason a
 * grep for "is the formatting centralised" answers yes while the site is
 * formatted in 83 places.
 *
 * WHY NOT MIGRATE ALL 142 HERE. Two of them are byte-identical to `formatDate`
 * and were migrated. The rest are not: `toLocaleDateString('he-IL')` with no
 * options renders `9.9.2026` and `formatDateShort` renders `09.09.2026`, so a
 * mechanical sweep would silently change what 80 screens display, including
 * invoices and statements a bookkeeper files. That is a deliberate change per
 * surface, with a look at each, and not a gate's job.
 *
 * WHAT THIS DOES INSTEAD is stop the number growing. A new call site that spells
 * the locale inline fails `pnpm lint`, which is the only moment anybody is
 * looking at that line. Lower the ceiling whenever a batch migrates; never raise
 * it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * The ceiling. 142 on 2026-09-10 in 83 files; 140 after the two byte-identical
 * sites (`vouchers/coupon-view.ts`, `wallet/pass-model.ts`) moved to
 * `formatDate`. NEVER RAISE IT.
 */
const CEILING = 140

/** The sanctioned homes for a locale tag, and the only ones. */
const ALLOWED_PREFIXES = ['src/lib/i18n/', 'src/lib/money']

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      walk(full, out)
    } else if (['.ts', '.tsx'].includes(extname(entry))) {
      out.push(full)
    }
  }
  return out
}

const counts = new Map()
let total = 0

for (const file of walk('src')) {
  if (/\.test\.tsx?$/.test(file) || file.includes('/__tests__/')) continue
  if (ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix))) continue
  const hits = (readFileSync(file, 'utf8').match(/'he-IL'/g) ?? []).length
  if (hits === 0) continue
  counts.set(file, hits)
  total += hits
}

const files = [...counts.entries()].sort((a, b) => b[1] - a[1])

if (total > CEILING) {
  console.error(`locale-format gate: ${total} inline 'he-IL' occurrences, ceiling ${CEILING}.\n`)
  for (const [file, hits] of files.slice(0, 10))
    console.error(`  ${String(hits).padStart(3)}  ${file}`)
  console.error(
    '\nUse src/lib/i18n/format.ts (formatDate, formatDateShort, formatDateTime, formatTime,\nformatNumber, formatPercent) instead of spelling the locale into a call site. It is the\none place a second locale can ever be switched on, and the reason this ceiling exists is\nthat 142 call sites already bypass it.',
  )
  process.exit(1)
}

if (total < CEILING) {
  console.error(
    `locale-format gate: ${total} inline 'he-IL' occurrences, below the ceiling of ${CEILING}.\n`,
  )
  console.error(
    `Lower CEILING in scripts/locale-format-gate.mjs to ${total} and record which batch\nmigrated. A ceiling left above what is there stops catching the next addition.`,
  )
  process.exit(1)
}

console.log(
  `locale-format gate: clean (${total} inline 'he-IL' in ${files.length} files, at the ceiling)`,
)
