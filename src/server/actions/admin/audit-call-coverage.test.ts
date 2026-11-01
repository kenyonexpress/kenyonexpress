import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every admin server action that mutates data must write an audit_log row
 * through `writeAuditLog` (V2 principle 2: no write without audit).
 *
 * Whether a file mutates is computed from its source, not from a filename
 * allowlist: a file counts as mutating when it contains a PostgREST write
 * builder call, or an `.rpc(` whose function is not on the read-only list
 * below. A new mutating action added to this directory without an audit call
 * fails here instead of silently losing its trail.
 */

const DIR = join(process.cwd(), 'src/server/actions/admin')

const WRITE_BUILDER_CALLS = ['.insert(', '.update(', '.delete(', '.upsert(']

/**
 * RPC functions callable from this directory that only read. Empty on purpose:
 * every rpc an admin action calls today changes state (fn_pay_referral,
 * fn_reject_referral, release_order_stock, the four payout_statement functions,
 * fn_cashback_admin_adjust, admin_refresh_reports). Add a name here only with
 * a comment pointing at the function body proving it is read-only.
 */
const READ_ONLY_RPCS: string[] = []

const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

function rpcNames(source: string): string[] {
  return [...source.matchAll(/\.rpc\(\s*'([A-Za-z0-9_]+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

function mutates(source: string): boolean {
  if (WRITE_BUILDER_CALLS.some((call) => source.includes(call))) return true
  return rpcNames(source).some((name) => !READ_ONLY_RPCS.includes(name))
}

describe('admin actions audit-call coverage', () => {
  it('scans a non-empty directory', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s audits its mutations (or has none)', (file) => {
    const source = readFileSync(join(DIR, file), 'utf8')
    if (!mutates(source)) return
    expect(source, `${file} mutates state but never calls writeAuditLog`).toContain('writeAuditLog')
  })

  it('read-only rpc exceptions actually appear in the directory', () => {
    const allRpcs = new Set(files.flatMap((f) => rpcNames(readFileSync(join(DIR, f), 'utf8'))))
    for (const name of READ_ONLY_RPCS) {
      expect(allRpcs, `stale READ_ONLY_RPCS entry: ${name}`).toContain(name)
    }
  })
})
