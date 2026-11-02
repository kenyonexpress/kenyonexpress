import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  agorotFromDb,
  agorotFromIlsColumn,
  agorotFromIlsNumber,
  agorotFromShekelInput,
  agorotToDecimalString,
  bpFromPercentColumn,
  bpToPercentString,
} from './money'

/**
 * C141 money invariant: no `parseFloat`, `.toFixed` or `Number(` on a money
 * path anywhere in `src/` except `src/lib/money.ts`, which owns every boundary
 * between integer agorot and the outside world.
 *
 * A "money path" is a non-comment source line that names a money concept
 * (price, agorot, ils, amount, total, percent, commission, fee, ...), or ANY
 * non-comment line in a file whose path names one (`product-money.ts`,
 * `cashback/`, `PriceRangeSlider.tsx`). The
 * keyword list is deliberately wide: a false positive is fixed by routing the
 * value through a `money.ts` helper, which is what the rule wants anyway.
 */

const ROOT = resolve(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const ALLOWED = new Set(['src/lib/money.ts'])

const FORBIDDEN = /(?:^|[^A-Za-z0-9_$.])Number\(|parseFloat\(|\.toFixed\(/
const MONEY =
  /price|agorot|ils|amount|total|money|percent|commission|fee|payout|cashback|discount|refund|vat|balance|cost|subtotal|shekel|₪/i

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(full)
  }
  return out
}

function isComment(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')
}

function findMoneyViolations(): string[] {
  const hits: string[] = []
  for (const file of walk(SRC, [])) {
    const rel = relative(ROOT, file).split('\\').join('/')
    if (ALLOWED.has(rel)) continue
    const moneyFile = MONEY.test(rel)
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!isComment(line) && FORBIDDEN.test(line) && (moneyFile || MONEY.test(line))) {
          hits.push(`${rel}:${i + 1}: ${line.trim()}`)
        }
      })
  }
  return hits
}

describe('C141 money invariants', () => {
  it('no parseFloat / toFixed / Number( on a money path outside src/lib/money.ts', () => {
    const hits = findMoneyViolations()
    expect(hits, hits.join('\n')).toEqual([])
  })
})

describe('money.ts boundary helpers', () => {
  it('reads integer agorot columns exactly', () => {
    expect(agorotFromDb('123456789012')).toBe(123456789012)
    expect(agorotFromDb(4990)).toBe(4990)
    expect(agorotFromDb(null)).toBe(0)
    expect(agorotFromDb(undefined, 7)).toBe(7)
    expect(agorotFromDb('abc')).toBe(0)
  })

  it('converts legacy shekel columns without a float round-trip', () => {
    expect(agorotFromIlsColumn('49.90')).toBe(4990)
    expect(agorotFromIlsColumn(49.9)).toBe(4990)
    expect(agorotFromIlsColumn(0.1 + 0.2)).toBe(30)
    expect(agorotFromIlsNumber(1.005)).toBe(101)
    expect(agorotFromIlsColumn('-3.5')).toBe(-350)
    expect(agorotFromIlsColumn(null)).toBeNull()
    expect(agorotFromIlsColumn('x')).toBeNull()
  })

  it('round-trips agorot to a decimal string', () => {
    expect(agorotToDecimalString(4990)).toBe('49.90')
    expect(agorotToDecimalString(-5)).toBe('-0.05')
    expect(agorotToDecimalString(100)).toBe('1.00')
  })

  it('parses admin shekel input', () => {
    expect(agorotFromShekelInput('1,299')).toBe(129900)
    expect(agorotFromShekelInput('49')).toBe(4900)
    expect(agorotFromShekelInput('')).toBeNull()
    expect(agorotFromShekelInput('12a')).toBeNull()
  })

  it('reads percent columns as basis points', () => {
    expect(bpFromPercentColumn('12.50')).toBe(1250)
    expect(bpFromPercentColumn(30)).toBe(3000)
    expect(bpFromPercentColumn(null)).toBeNull()
    expect(bpToPercentString(1250)).toBe('12.50')
    expect(bpToPercentString(1250, 1)).toBe('12.5')
    expect(bpToPercentString(1250, 0)).toBe('13')
  })
})
