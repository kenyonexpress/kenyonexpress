import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOSTED_COLUMNS, HOSTED_RPCS } from '@/lib/commerce/hosted-columns'
import { orderCashbackSelect, orderItemPriceSelect } from '@/lib/commerce/order-money-columns'
import { ILS_SCHEMA } from '@/lib/payments/payment-money-columns'
import { describe, expect, it } from 'vitest'

/**
 * STEP 40. finalize runs AFTER the card is charged, so a column it names that
 * the hosted project does not have is the worst failure the system has: a
 * paid customer and an order stuck in `pending`. That is exactly what
 * `orders.cashback_applied_agorot` and `order_items.unit_price_agorot` were
 * before 224 (42703 on the first select, whole statement aborted), and
 * `src/types/database.ts` could not catch it because finalize casts its rows
 * past the generated types.
 *
 * This test reads finalize.ts as text and checks every column it selects,
 * filters on, inserts or updates, and every RPC argument it passes, against
 * the hosted schema measured on 2026-10-08 (hosted-columns.ts). It also
 * refuses a WRITE to any GENERATED column: 224 made the two names readable as
 * `round(<ils> * 100)::bigint` twins, and an insert that names one is 428C9.
 *
 * The scrape is deliberately simple: a chain is the text from one
 * `.from('<table>')` to the next data-access call. Dynamic select fragments
 * (`${...}`) are checked separately through the functions that build them.
 */

const root = resolve(__dirname, '../../..')
const source = readFileSync(resolve(root, 'src/server/payments/finalize.ts'), 'utf8')

type Access = { table: string; column: string; kind: 'read' | 'write'; where: string }

/** Drops every nested `{...}` so only the object's own keys remain. */
function flattenObject(text: string): string {
  let out = text
  let previous = ''
  while (previous !== out) {
    previous = out
    out = out.replace(/\{[^{}]*\}/g, (match, offset) => (offset === 0 ? match : ' '))
  }
  return out
}

function objectKeys(text: string): string[] {
  const inner = flattenObject(text).replace(/^\{/, '').replace(/\}$/, '')
  return [...inner.matchAll(/(?:^|[{,\s])([a-z_0-9]+)\s*:/g)].map((m) => m[1] as string)
}

/** The `{...}` that starts at `start`, by brace counting. */
function objectAt(text: string, start: number): string {
  let depth = 0
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error(`unterminated object at ${start}`)
}

function selectColumns(fragment: string): string[] {
  return fragment
    .replace(/\$\{[^}]*\}/g, '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => (token.includes(':') ? (token.split(':')[1] as string).trim() : token))
}

function scrapeAccesses(): Access[] {
  const accesses: Access[] = []
  const starts = [...source.matchAll(/\.from\('([a-z_]+)'\)/g)]
  starts.forEach((match, index) => {
    const table = match[1] as string
    const begin = (match.index ?? 0) + match[0].length
    const nextFrom = starts[index + 1]?.index ?? source.length
    const nextRpc = source.indexOf('.rpc(', begin)
    const end = Math.min(nextFrom, nextRpc === -1 ? source.length : nextRpc)
    const chain = source.slice(begin, end)
    const line = source.slice(0, begin).split('\n').length
    const where = `finalize.ts:${line} ${table}`

    for (const select of chain.matchAll(/\.select\(\s*(['`])([\s\S]*?)\1/g)) {
      for (const column of selectColumns(select[2] as string)) {
        accesses.push({ table, column, kind: 'read', where })
      }
    }
    for (const filter of chain.matchAll(
      /\.(?:eq|neq|in|is|gt|gte|lt|lte|order)\('([a-z_0-9]+)'/g,
    )) {
      accesses.push({ table, column: filter[1] as string, kind: 'read', where })
    }
    for (const write of chain.matchAll(/\.(?:insert|update|upsert)\(\s*\{/g)) {
      const object = objectAt(chain, (write.index ?? 0) + write[0].length - 1)
      for (const column of objectKeys(object)) {
        accesses.push({ table, column, kind: 'write', where })
      }
    }
  })
  return accesses
}

type RpcCall = { name: string; args: string[]; where: string }

function scrapeRpcs(): RpcCall[] {
  return [...source.matchAll(/\.rpc\(\s*'([a-z_]+)'(?:\s+as\s+never)?,\s*\{/g)].map((match) => {
    const object = objectAt(source, (match.index ?? 0) + match[0].length - 1)
    const line = source.slice(0, match.index ?? 0).split('\n').length
    return { name: match[1] as string, args: objectKeys(object), where: `finalize.ts:${line}` }
  })
}

const accesses = scrapeAccesses()
const rpcs = scrapeRpcs()

describe('finalize.ts names only what the hosted project has (STEP 40)', () => {
  it('scrapes the tables and calls the audit is about', () => {
    const tables = new Set(accesses.map((a) => a.table))
    expect([...tables].sort()).toEqual([
      'audit_log',
      'carts',
      'order_items',
      'orders',
      'payment_tokens',
      'payments',
      'products',
      'profiles',
      'split_executions',
      'vouchers',
      'wallet_accounts',
    ])
    expect(rpcs.map((r) => r.name).sort()).toEqual([
      'consume_order_discount',
      'consume_order_stock',
      'fn_attribute_cart_recovery',
      'fn_enqueue_notification',
      'fn_wallet_transfer',
      'fn_wallet_transfer',
    ])
    expect(accesses.length).toBeGreaterThan(40)
  })

  it('every table it touches is in the fixture', () => {
    for (const table of new Set(accesses.map((a) => a.table))) {
      expect(HOSTED_COLUMNS[table], `hosted-columns.ts has no table ${table}`).toBeDefined()
    }
  })

  it('every static column it selects, filters on or writes exists', () => {
    for (const { table, column, where } of accesses) {
      expect(
        HOSTED_COLUMNS[table]?.[column],
        `${where}: ${table}.${column} does not exist`,
      ).toBeDefined()
    }
  })

  it('never writes a GENERATED column (428C9 on the hosted project)', () => {
    for (const { table, column, kind, where } of accesses) {
      if (kind !== 'write') continue
      expect(
        HOSTED_COLUMNS[table]?.[column]?.generated,
        `${where}: ${table}.${column} is GENERATED ALWAYS and cannot be written`,
      ).toBe(false)
    }
  })

  it('every insert carries every NOT NULL column that has no default', () => {
    const inserts = [...source.matchAll(/\.from\('([a-z_]+)'\)\s*\.insert\(\s*\{/g)]
    expect(inserts.length).toBeGreaterThanOrEqual(3)
    for (const match of inserts) {
      const table = match[1] as string
      const written = new Set(
        objectKeys(objectAt(source, (match.index ?? 0) + match[0].length - 1)),
      )
      for (const [column, meta] of Object.entries(HOSTED_COLUMNS[table] ?? {})) {
        if (!meta.required) continue
        expect(written.has(column), `insert into ${table} omits NOT NULL ${column}`).toBe(true)
      }
    }
  })

  it('every RPC argument matches an overload the hosted project has', () => {
    for (const { name, args, where } of rpcs) {
      const overloads = HOSTED_RPCS[name]
      expect(overloads, `${where}: function ${name} does not exist`).toBeDefined()
      const matches = (overloads ?? []).some(
        (signature) =>
          args.every((arg) => signature.includes(arg)) &&
          signature.every((arg) => args.includes(arg)),
      )
      expect(matches, `${where}: ${name}(${args.join(', ')}) matches no overload`).toBe(true)
    }
  })
})

describe('the dynamic select fragments resolve to hosted columns', () => {
  it('orders: the 224 cashback twin is a real, generated, read-only column', () => {
    for (const column of selectColumns(orderCashbackSelect())) {
      expect(HOSTED_COLUMNS.orders?.[column]).toEqual({ generated: true, required: false })
    }
  })

  it('order_items: the ils fragment names unit_price_agorot bare and aliases total_price', () => {
    const fragment = orderItemPriceSelect('ils')
    expect(fragment).toContain('unit_price_agorot')
    for (const column of selectColumns(fragment)) {
      expect(HOSTED_COLUMNS.order_items?.[column], `order_items.${column}`).toBeDefined()
    }
    expect(HOSTED_COLUMNS.order_items?.unit_price_agorot?.generated).toBe(true)
    // The bare post-059 name is still absent, which is why the alias stays.
    expect(HOSTED_COLUMNS.order_items?.total_price_agorot).toBeUndefined()
  })

  it('payments: the hosted generation is ils and both of its columns exist', () => {
    expect(HOSTED_COLUMNS.payments?.[ILS_SCHEMA.walletAppliedColumn]).toBeDefined()
    expect(HOSTED_COLUMNS.payments?.[ILS_SCHEMA.amountColumn]).toBeDefined()
    expect(HOSTED_COLUMNS.payments?.wallet_applied_agorot).toBeUndefined()
  })

  it('the generation probes still resolve the hosted project as pre-059', () => {
    // buildOrderMoneyRow('agorot') would write cashback_applied_agorot, which
    // is GENERATED here; the probes must keep answering `ils`.
    expect(HOSTED_COLUMNS.orders?.total_agorot).toBeUndefined()
    expect(HOSTED_COLUMNS.order_items?.platform_bp).toBeUndefined()
  })
})
