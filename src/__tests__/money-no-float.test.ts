import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ZERO FLOATS ON THE MONEY PATH -- the static half (marathon step 10).
 *
 * The runtime half already exists: `assertSafeInteger` inside money.ts
 * refuses a float amount at every primitive, and money.test.ts pins that.
 * What had no gate was the WRITING of new float arithmetic around the
 * primitives -- `round2(current * factor)` lived in admin/products.ts for
 * months because nothing scanned for it. This file is that scan.
 *
 * WHY A TEST AND NOT A BIOME RULE. Biome (this repo's linter) has no
 * user-defined rule plugins; the patterns below need content-level regexes
 * with a curated allowlist, which is exactly what a source-scanning test in
 * the style of cron-auth.test.ts / audit-required.test.ts does. The test IS
 * the lint rule, and it runs in the same `pnpm test` gate CI enforces.
 *
 * THE RULES.
 *  - `parseFloat` does not belong near money. (Rates at the env/schema
 *    boundary are the one carve-out, listed below.)
 *  - `Math.round(x * 100)` is the classic ILS->agorot float multiply. The
 *    sanctioned spelling is `ilsToAgorot(x.toFixed(2))`: toFixed pins the
 *    value to exactly two decimals AS A STRING and ilsToAgorot parses it
 *    exactly, so the only rounding is the explicit half-up one. The
 *    remaining Math.round sites are boundary readers, each named below with
 *    its reason.
 *  - `.toFixed(` is allowed ONLY as the argument of ilsToAgorot (the idiom
 *    above) or in a named display-formatting site.
 *  - A decimal-literal multiply (`* 0.9`) is float rate math, full stop.
 */

const MONEY_PATH = [
  'src/lib/money.ts',
  'src/lib/commerce',
  'src/lib/cart',
  'src/lib/checkout',
  'src/lib/payments',
  'src/lib/admin/bulk-price.ts',
  'src/server/payments',
  'src/server/actions/payments',
]

type Allow = { file: string; test: RegExp; reason: string }

const FORBIDDEN: { name: string; pattern: RegExp; allow: Allow[] }[] = [
  {
    name: 'parseFloat',
    pattern: /parseFloat\s*\(/,
    allow: [
      {
        file: 'src/lib/money.ts',
        test: /Number\.parseFloat\(percent\)/,
        reason:
          'the percent->bp constructor parses a RATE at the schema boundary, then goes integer',
      },
    ],
  },
  {
    name: 'Math.round of an ILS multiply',
    pattern: /Math\.round\([^)]*\*\s*100/,
    allow: [
      {
        file: 'src/lib/money.ts',
        test: /Math\.round\(asNumber \* 100 \* 100\)/,
        reason:
          'inside bp() itself: a rate, not an amount, and divRoundHalfUp finishes it in integers',
      },
      {
        file: 'src/lib/commerce/product-money.ts',
        test: /Math\.round\(value \* 100\) \/ 100/,
        reason: 'two-decimal clamp for a numeric ILS column write, not arithmetic between amounts',
      },
      {
        file: 'src/lib/commerce/order-money-columns.ts',
        test: /Math\.round\(parsed \* 100\)/,
        reason: 'fromIls: reading a pre-059 numeric column that has no generated agorot twin',
      },
      {
        file: 'src/lib/checkout/wallet-input.ts',
        test: /Math\.round\(value \* 100\) \/ 100/,
        reason:
          'clamps a text INPUT to two decimals for display; the server re-parses with toFixed',
      },
      {
        file: 'src/lib/payments/payment-money-columns.ts',
        test: /Math\.round\(parsed \* 100\)/,
        reason: 'fromIls twin of order-money-columns, for the payments table generations',
      },
    ],
  },
  {
    name: 'bare toFixed (outside the ilsToAgorot idiom)',
    // toFixed NOT immediately consumed by ilsToAgorot on the same line.
    pattern: /\.toFixed\(/,
    allow: [
      {
        file: '*',
        test: /ilsToAgorot\(.*\.toFixed\(2\)\)/,
        reason: 'THE sanctioned boundary idiom: pin to a 2-decimal string, parse exactly',
      },
      {
        file: 'src/lib/commerce/recurring.ts',
        test: /`₪\$\{ils\.toFixed\(2\)\}`/,
        reason: 'display formatting of a value already derived from integer agorot',
      },
      {
        file: 'src/lib/payments/cardcom.ts',
        test: /\(amountAgorot \/ 100\)\.toFixed\(2\)/,
        reason: "the wire format Cardcom's API demands; integer/100 then toFixed is exact",
      },
    ],
  },
  {
    name: 'decimal-literal multiply',
    pattern: /\*\s*0\.\d/,
    allow: [],
  },
]

function moneyFiles(): string[] {
  const found: string[] = []
  const cwd = process.cwd()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
        found.push(relative(cwd, full).split('\\').join('/'))
      }
    }
  }
  for (const root of MONEY_PATH) {
    const abs = resolve(process.cwd(), root)
    if (statSync(abs).isDirectory()) walk(abs)
    else found.push(root)
  }
  return found.sort()
}

/** Strips comments so a rule quoted while being explained does not trip the scan. */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

describe('zero floats on the money path', () => {
  const files = moneyFiles()

  it('scans a real tree, not an empty glob', () => {
    expect(files.length).toBeGreaterThan(30)
    expect(files).toContain('src/lib/money.ts')
  })

  for (const rule of FORBIDDEN) {
    it(`forbids ${rule.name} outside the named boundary sites`, () => {
      const violations: string[] = []
      for (const file of files) {
        const code = codeOnly(readFileSync(resolve(process.cwd(), file), 'utf8'))
        for (const line of code.split('\n')) {
          if (!rule.pattern.test(line)) continue
          const allowed = rule.allow.some(
            (a) => (a.file === '*' || a.file === file) && a.test.test(line),
          )
          if (!allowed) violations.push(`${file}: ${line.trim()}`)
        }
      }
      expect(
        violations,
        `float arithmetic on the money path. Money is integer agorot through src/lib/money.ts; convert at the boundary with ilsToAgorot(x.toFixed(2)) or add a NAMED allowlist entry here with the reason it is a boundary and not arithmetic.\n${violations.join('\n')}`,
      ).toEqual([])
    })
  }
})
