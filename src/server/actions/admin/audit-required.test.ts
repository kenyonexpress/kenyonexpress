import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY ADMIN MUTATION WRITES AN AUDIT ROW - PER FUNCTION, NOT PER FILE.
 *
 * `writeAuditLog` is the only writer of `audit_log`; RLS blocks authenticated
 * inserts. A mutation that skips it is a write with no actor, no before/after
 * and no IP.
 *
 * WHY THIS TEST WAS REWRITTEN ON 2026-09-08. It used to ask whether the FILE
 * contained the string `writeAuditLog` anywhere. A module with seven actions
 * passed if one of them audited, and three mutations were shipping with no
 * audit row underneath a green test:
 *
 *   vendors.ts       runUpdateVendorStatus    suspends a vendor, taking their
 *                                             whole catalogue off the storefront
 *   vendors.ts       runSoftDeleteVendor      removes the vendor
 *   coupon-deals.ts  runSoftDeleteCouponDeal  archives a live offer
 *
 * TWO OF THE THREE ARE DELETES, and that is the shape worth naming: in each
 * module the create/update path was audited and the delete path was not. A
 * delete is the mutation an audit row exists for, because it is the one that
 * cannot be reconstructed from the surviving state.
 *
 * The count that found them was a heuristic and it was WRONG about two other
 * files, which is why this reads bodies instead. `shipping.ts` has two exports
 * over one shared implementation that does audit; `vouchers.ts` has one read
 * and one audited mutation. Neither was a defect.
 *
 * WHY IT SCANS `run*` BODIES. Every action here is
 * `export async function x() { return withActionContext('...', () => runX()) }`
 * - the guard and the work are two hops in, and a scanner that only looked at
 * the exported wrapper would find neither the write nor the audit.
 */

const ADMIN_ACTIONS = join(process.cwd(), 'src/server/actions/admin')

/** Modules that mutate nothing. Each is a read path or an upload helper. */
const READ_ONLY = new Set(['quick-search.ts', 'upload.ts', 'images.ts'])

function actionFiles(): string[] {
  return readdirSync(ADMIN_ACTIONS)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .filter((name) => !READ_ONLY.has(name))
    .sort()
}

/**
 * The body of each `async function runX(...)`, sliced to the next top-level
 * `async function` or `export`. Crude on purpose: a real parser would be a
 * second thing to keep correct, and these files all follow one layout.
 */
function implementations(source: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  const re = /^async function (run\w+)\s*\(/gm
  const starts: { name: string; at: number }[] = []
  let m = re.exec(source)
  while (m) {
    starts.push({ name: m[1] ?? '', at: m.index })
    m = re.exec(source)
  }
  for (const [i, s] of starts.entries()) {
    // `starts[i + 1]` is in range by construction, but under noUncheckedIndexedAccess
    // the compiler cannot know that, and silencing it with `!` would be the one
    // place in this file where a wrong assumption could not fail loudly.
    const next = starts[i + 1]
    const end = next ? next.at : source.length
    out.push({ name: s.name, body: source.slice(s.at, end) })
  }
  return out
}

/** Does this body write to the database? */
const WRITES = /\.(update|insert|upsert|delete)\s*\(|\.rpc\s*\(/

describe('every admin mutation writes an audit row', () => {
  const offenders: string[] = []
  let mutationsChecked = 0

  for (const file of actionFiles()) {
    const source = readFileSync(join(ADMIN_ACTIONS, file), 'utf8')
    for (const impl of implementations(source)) {
      if (!WRITES.test(impl.body)) continue
      mutationsChecked++
      if (!impl.body.includes('writeAuditLog')) offenders.push(`${file}  ${impl.name}`)
    }
  }

  it('finds mutations to check, so this cannot pass by scanning nothing', () => {
    // The failure mode of every scanner in this repo that has gone wrong.
    expect(mutationsChecked).toBeGreaterThanOrEqual(15)
  })

  it('leaves no mutation unaudited', () => {
    expect(
      offenders,
      `these write to the database and record no audit row:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})

/**
 * The old file-level assertion, kept. It is weaker but not redundant: it also
 * covers a module whose mutation this scanner's layout assumptions miss.
 */
describe('every mutating admin module references the helper', () => {
  it('calls writeAuditLog somewhere in each file', () => {
    const missing = actionFiles().filter(
      (name) => !readFileSync(join(ADMIN_ACTIONS, name), 'utf8').includes('writeAuditLog'),
    )
    expect(missing).toEqual([])
  })
})
