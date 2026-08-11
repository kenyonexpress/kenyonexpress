#!/usr/bin/env node
/**
 * CI gate for the dynamic-percentage rule in AGENTS.md.
 *
 * THE RULE: no fixed commission or split percentage exists in this project.
 * Every percentage is per product, set by the admin. No global default, no env
 * var, no config constant, no fallback. An empty field is a validation error.
 *
 * WHY THIS IS NOT `grep -e '0\.05|5%'`
 *
 * That grep was run on 2026-08-11 and returned 823 hits, of which 738 were
 * WordPress XML, markdown and SQL, and only ONE was a real fee constant. A gate
 * with that signal-to-noise ratio gets muted within a week, so this file does
 * not look for the digit 5. It looks for the three SHAPES that actually
 * reintroduce a fixed percentage, all of which are absent from legitimate test
 * fixtures:
 *
 *   1. a zod `.default(N)` on a commission/split field
 *   2. a `??` or `||` fallback to a numeric literal on a commission/split name
 *   3. a module constant whose name says commission/split/fee and whose value
 *      is a bare number
 *
 * A test fixture that passes `platformPercent: 5` as an INPUT is not a default
 * and is deliberately not matched. The percentage arriving from the product row
 * is the thing under test there.
 *
 * STATUTORY RATES ARE EXEMPT. VAT and the distance-selling cancellation fee are
 * set by Israeli law, not by an admin, so hardcoding them is correct. They are
 * allowlisted by exact symbol name below and nowhere else.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_DIRS = ['src', 'apps', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git', 'test-results'])

/**
 * Generated from the database; it mirrors column names and defaults rather than
 * declaring them, so it cannot introduce a policy default.
 */
const SKIP_FILES = new Set(['src/types/database.ts'])

/**
 * Set by law, not by an admin. Each entry must name the symbol AND the statute
 * it comes from, so that adding one is a visible decision.
 */
const STATUTORY_ALLOWLIST = [
  { symbol: 'CANCELLATION_FEE_RATE', why: 'Israeli distance-selling law: lower of 5% or ILS 100' },
  { symbol: 'CANCELLATION_FEE_CAP_AGOROT', why: 'the ILS 100 half of the same statutory cap' },
  { symbol: 'DEFAULT_VAT_PERCENT', why: 'statutory VAT rate' },
]
const ALLOWED_SYMBOLS = new Set(STATUTORY_ALLOWLIST.map((e) => e.symbol))

/**
 * Names that denote a RATE, not an amount.
 *
 * The distinction is the whole accuracy of this gate. `commission_agorot ?? 0`
 * is a nullable money column being read for display, and defaulting it to zero
 * is correct; `commission_percent ?? 10` invents a rate nobody chose. The first
 * draft of this file matched bare `commission` and reported four such amount
 * reads as violations, which is exactly the noise that gets a gate switched
 * off. Only percent/rate suffixes are matched.
 */
const RATE_NAME =
  '(?:commission_percent|commissionPercent|commission_rate|commissionRate|supplier_split_percent|supplierSplitPercent|split_percent|splitPercent|platform_percent|platformPercent|platform_fee_percent|fee_percent|feePercent|fee_rate|feeRate)'

const RULES = [
  {
    id: 'zod-default',
    // `commission_rate: z.coerce.number().default(90)`
    pattern: new RegExp(`${RATE_NAME}[A-Za-z_]*\\s*:\\s*z\\.[^\\n]*\\.default\\(\\s*[0-9]`, 'i'),
    message:
      'zod .default() on a commission/split field. The admin must set it; there is no default.',
  },
  {
    id: 'nullish-fallback',
    // `formData.get('commission_rate') ?? '90'`, `vendor?.commission_rate ?? 90`
    pattern: new RegExp(
      `${RATE_NAME}[A-Za-z_']*\\s*\\)?\\s*(?:\\?\\?|\\|\\|)\\s*['"\`]?[0-9]`,
      'i',
    ),
    message:
      'fallback to a numeric literal for a commission/split. A blank field is an error, not a default.',
    // A test may read a nullable snapshot with `?? 0` inside an assertion. That
    // narrows a type in an expectation; it does not install a policy default.
    skipTests: true,
  },
  {
    id: 'module-constant',
    // `const PLATFORM_FEE = 0.05`, `const DEFAULT_COMMISSION_PERCENT = 5`
    // A literal, not `new RegExp`: this one interpolates nothing.
    pattern:
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*(?:COMMISSION|Commission|SPLIT|Split|PLATFORM_FEE|FEE_PERCENT|FEE_RATE)[\w$]*)\s*(?::[^=]+)?=\s*[0-9]/,
    message: 'module constant holding a fixed commission/split rate.',
    // The captured symbol is checked against the statutory allowlist.
    symbolGroup: 1,
  },
]

/**
 * `--self-test` proves the rules still bite.
 *
 * A gate that passes because its regexes silently stopped matching is worse
 * than no gate, because it reports success. These fixtures are the exact lines
 * removed on 2026-08-11 plus the amount-vs-rate cases that must NOT fire.
 */
function selfTest() {
  const cases = [
    // [line, ruleThatMustFire | null, description]
    [
      '  commission_rate: z.coerce.number().min(0).max(100).default(90),',
      'zod-default',
      'the vendor schema default',
    ],
    [
      "    commission_rate: formData.get('commission_rate') ?? '90',",
      'nullish-fallback',
      'the vendor action fallback',
    ],
    [
      '              defaultValue={vendor?.commission_rate ?? 90}',
      'nullish-fallback',
      'the vendor form default',
    ],
    [
      '  commission_percent: v.commission_rate ?? 10,',
      'nullish-fallback',
      'the 044 mirror fallback',
    ],
    ['const PLATFORM_FEE_PERCENT = 5', 'module-constant', 'a module-level fee constant'],
    [
      'const DEFAULT_COMMISSION_RATE = 0.05',
      'module-constant',
      'a module-level commission constant',
    ],
    // Must NOT fire: amounts, statutory rates, and values read from a row.
    ['  commission_agorot: item.commission_agorot ?? 0,', null, 'a nullable money AMOUNT read'],
    ['  platformFeeAgorot: row.commission_agorot ?? 0,', null, 'another amount read'],
    ['const CANCELLATION_FEE_RATE = 0.05', null, 'the statutory cancellation rate'],
    ['const DEFAULT_VAT_PERCENT = 18', null, 'the statutory VAT rate'],
    ['  platformPercent: product.platform_percent,', null, 'a rate read from the product row'],
    ['      lines: [couponLine({ platformPercent: 100 })],', null, 'a test fixture INPUT'],
  ]

  let failed = 0
  for (const [line, expected, description] of cases) {
    const fired = []
    for (const rule of RULES) {
      const match = line.match(rule.pattern)
      if (!match) continue
      if (rule.symbolGroup && ALLOWED_SYMBOLS.has(match[rule.symbolGroup])) continue
      fired.push(rule.id)
    }
    const ok = expected === null ? fired.length === 0 : fired.includes(expected)
    if (!ok) {
      failed++
      console.error(`  ✖ ${description}`)
      console.error(`      line:     ${line.trim()}`)
      console.error(`      expected: ${expected ?? 'no rule to fire'}`)
      console.error(`      actual:   ${fired.length ? fired.join(', ') : 'none'}`)
    }
  }

  if (failed > 0) {
    console.error(
      `\n✖ self-test: ${failed}/${cases.length} case(s) wrong. The rules no longer bite.\n`,
    )
    process.exit(1)
  }
  console.log(`✓ self-test: all ${cases.length} cases correct (6 caught, 6 correctly ignored)`)
  process.exit(0)
}

if (process.argv.includes('--self-test')) selfTest()

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|mjs|cjs|js|jsx)$/.test(entry)) out.push(full)
  }
  return out
}

const violations = []

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    if (SKIP_FILES.has(rel)) continue
    // This gate describes the patterns it bans, so it would flag itself.
    if (rel === 'scripts/no-hardcoded-fees.mjs') continue

    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      // A line that is purely a comment documents the rule rather than breaking it.
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return

      const isTest = /\.(test|spec)\.[jt]sx?$/.test(rel) || rel.includes('__tests__')

      for (const rule of RULES) {
        if (rule.skipTests && isTest) continue
        const match = line.match(rule.pattern)
        if (!match) continue
        if (rule.symbolGroup && ALLOWED_SYMBOLS.has(match[rule.symbolGroup])) continue
        violations.push({
          file: rel,
          line: i + 1,
          rule: rule.id,
          message: rule.message,
          text: line.trim(),
        })
      }
    })
  }
}

if (violations.length === 0) {
  console.log('✓ no hardcoded commission or split percentage found')
  console.log(
    `  statutory rates allowlisted: ${STATUTORY_ALLOWLIST.map((e) => e.symbol).join(', ')}`,
  )
  process.exit(0)
}

console.error(
  `\n✖ ${violations.length} hardcoded percentage violation(s) of the rule in AGENTS.md:\n`,
)
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]`)
  console.error(`    ${v.text}`)
  console.error(`    ${v.message}\n`)
}
console.error('Every percentage is per product and set by the admin. If a rate is set by')
console.error('law rather than by an admin, add it to STATUTORY_ALLOWLIST with its statute.\n')
process.exit(1)
