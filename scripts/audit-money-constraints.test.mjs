import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE REPLAY DEFENCES ARE UNIQUE CONSTRAINTS, AND NOTHING COULD CHECK THEY EXIST.
 *
 * The Cardcom webhook inserts first and reads the error code: 23505 means the
 * callback was delivered twice and the second is a no-op. Without the
 * constraint the insert SUCCEEDS, the replay is handled as a fresh event, and a
 * card that was already charged is finalised again. The code is correct and all
 * of its correctness is borrowed from the schema.
 *
 * The schema cannot be read from this checkout: `supabase/migrations/` declares
 * all four and this project records that that directory does not describe
 * production; the generated types describe production and cannot express
 * uniqueness; the anon key sees none of these tables; the admin key answers 401.
 *
 * So the script asks pg_constraint, and - the part that matters - REFUSES to
 * report anything when it cannot look.
 */

const SCRIPT = resolve(process.cwd(), 'scripts/audit-money-constraints.mjs')

function run(args = [], env = { PATH: process.env.PATH }) {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, ...args], { env, encoding: 'utf8' }) }
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

const PRESENT = [
  { table_name: 'payments', constraint_name: 'a', columns: ['idempotency_key'] },
  { table_name: 'ledger_journals', constraint_name: 'b', columns: ['event_key'] },
  {
    table_name: 'payment_webhook_events',
    constraint_name: 'payment_webhook_events_dedup',
    columns: ['provider', 'external_event_id'],
  },
  { table_name: 'wallet_entries', constraint_name: 'd', columns: ['idempotency_key'] },
]

function withRows(rows) {
  const file = join(tmpdir(), `mc-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(file, JSON.stringify(rows))
  return file
}

describe('it refuses to answer without looking', () => {
  it('exits 2 with no database and no input file', () => {
    // "All four present" from a script that read nothing is the exact failure
    // this repository keeps finding, applied to the money path.
    const { code, out } = run()
    expect(code).toBe(2)
    expect(out).toContain('refuses')
  })

  it('exits 2 on an unreadable input file rather than assuming', () => {
    expect(run(['--from', '/nonexistent/nope.json']).code).toBe(2)
  })

  it('can print the query for a paste-through run', () => {
    const { code, out } = run(['--sql'])
    expect(code).toBe(0)
    expect(out).toContain('pg_constraint')
    expect(out).toContain('payment_webhook_events')
  })
})

describe('it reads the catalogue result correctly', () => {
  it('passes when all four are present', () => {
    const { code, out } = run(['--from', withRows(PRESENT)])
    expect(code).toBe(0)
    expect(out).toContain('all 4 replay defences are in place')
  })

  it('fails, and names the consequence, when the webhook dedup is gone', () => {
    const rows = PRESENT.filter((r) => r.table_name !== 'payment_webhook_events')
    const { code, out } = run(['--from', withRows(rows)])
    expect(code).toBe(1)
    expect(out).toContain('payment_webhook_events(provider, external_event_id)')
    expect(out).toContain('already charged')
  })

  it('is not fooled by the right columns on the wrong table', () => {
    const rows = PRESENT.map((r) =>
      r.table_name === 'wallet_entries' ? { ...r, table_name: 'wallet_entries_archive' } : r,
    )
    expect(run(['--from', withRows(rows)]).code).toBe(1)
  })
})

describe('the webhook still depends on what this checks', () => {
  it('treats a unique violation as the replay signal', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'src/app/api/payments/cardcom/webhook/route.ts'),
      'utf8',
    )
    expect(route).toContain('UNIQUE_VIOLATION')
    expect(route).toContain('external_event_id')
  })
})
