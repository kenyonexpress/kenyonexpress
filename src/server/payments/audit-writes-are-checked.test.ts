import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * NO AUDIT ROW IS WRITTEN WITHOUT LOOKING AT WHETHER IT LANDED.
 *
 * `audit_log` has three writers. One is `writeAuditLog` in lib/admin/audit.ts,
 * which has always destructured the error and logged `audit.write_failed`. The
 * other two are raw inserts on the MONEY path, and until 2026-09-08 both read
 *
 *     await admin.from('audit_log').insert({ ... })
 *
 * with no `error` in sight. A failed insert - a policy change, a constraint, a
 * type drift - produced no row and no log line and no signal of any kind.
 *
 * They are the two rows that matter most in the system:
 *
 *   payments/finalize.ts          a customer's order becoming `paid`
 *   actions/payments/refund.ts    the row that justifies a money reversal,
 *                                 BUSINESS-RULES section 10
 *
 * Migration 149 made `audit_log` append-only, so this table is exactly the kind
 * that can start refusing writes after a schema change.
 *
 * BEST EFFORT IS RIGHT AND SILENCE IS NOT. By the time either runs the card has
 * been charged or credited, so throwing would turn a completed money operation
 * into an error an operator retries - and the retry would attempt a second
 * charge. The requirement is therefore not "handle it", it is "say something".
 */

const ROOTS = ['src/server/payments', 'src/server/actions/payments', 'src/server/actions/admin']

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) tsFiles(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

/** Every `.from('audit_log').insert(` in the money and admin paths. */
const inserters = ROOTS.flatMap((root) => tsFiles(resolve(process.cwd(), root)))
  .map((file) => ({ rel: relative(process.cwd(), file), src: readFileSync(file, 'utf8') }))
  .filter(({ src }) => /\.from\(['"]audit_log['"]\)\s*\.insert\(/.test(src))

describe('raw audit_log inserts', () => {
  it('finds the inserts, so this cannot pass by scanning nothing', () => {
    expect(inserters.map((i) => i.rel).sort()).toEqual([
      'src/server/actions/payments/refund.ts',
      'src/server/payments/finalize.ts',
    ])
  })

  it.each(inserters.map((i) => i.rel))('%s captures the insert error', (rel) => {
    const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
    // The insert must be assigned, not fired and forgotten. `await admin.from(
    // 'audit_log').insert({...})` as a bare statement is the shape being
    // forbidden; `const { error: x } = await ...` is the shape required.
    const bareAwait = /(?<!=\s)await\s+admin\s*\n?\s*\.from\(['"]audit_log['"]\)/.test(src)
    expect(
      bareAwait,
      `${rel} writes audit_log without capturing the result. The card is already charged by then, so do not throw - destructure the error and log it, the way writeAuditLog in lib/admin/audit.ts does.`,
    ).toBe(false)
  })

  it.each(inserters.map((i) => i.rel))('%s logs when the insert fails', (rel) => {
    const src = readFileSync(resolve(process.cwd(), rel), 'utf8')
    expect(
      /auditError/.test(src) && /log\.error\(['"][\w.]*audit_write_failed/.test(src),
      `${rel} captures the audit error but never reports it, which is the same silence with more steps.`,
    ).toBe(true)
  })
})
