import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY ADMIN MUTATION PASSES A ROLE GUARD, AND THE GUARD IS TWO HOPS IN.
 *
 * `audit-required.test.ts` asks whether each mutation records who did it. This
 * asks the prior question: whether anyone checked they were allowed to.
 *
 * WHY THIS IS EASY TO GET WRONG, AND I GOT IT WRONG THREE TIMES WRITING IT.
 * A scan for a hardcoded list of guard names reported 15 unguarded mutations,
 * then 4, then 0 - the code was right every time and the scanner was not.
 *
 *   - `products.ts` and `categories.ts` call `requireCatalogWriter()`, a LOCAL
 *     helper that wraps `requireStaffSession()`.
 *   - `payouts.ts` calls `guard()`, a local helper wrapping
 *     `requireSection('payments', 'write')`.
 *
 * The project's own notes warn about exactly this: "server action guards are two
 * hops in; a flat grep says 0 of 84 guarded and is wrong". So this resolves the
 * hop instead of guessing names: a body is guarded if it awaits a `require*`
 * DIRECTLY, or awaits a local function in the same file that does.
 *
 * Measured 2026-09-08: 43 mutating admin actions, 43 guarded.
 */

const DIR = join(process.cwd(), 'src/server/actions/admin')
const WRITES = /\.(update|insert|upsert|delete)\s*\(|\.rpc\s*\(/
const DIRECT_GUARD = /await\s+require[A-Za-z]+\s*\(/

function actionFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort()
}

/** `async function name(` blocks, sliced to the next one. */
function blocks(src: string, prefix: string): { name: string; body: string }[] {
  const starts = [...src.matchAll(new RegExp(`^async function (${prefix}\\w*)\\s*\\(`, 'gm'))].map(
    (m) => ({ name: m[1] ?? '', at: m.index ?? 0 }),
  )
  return starts.map((s, i) => ({
    name: s.name,
    body: src.slice(s.at, i + 1 < starts.length ? (starts[i + 1]?.at ?? src.length) : src.length),
  }))
}

/** Local helpers in this file that reach a `require*` themselves. */
function guardHelpers(src: string): string[] {
  return blocks(src, '')
    .filter((b) => DIRECT_GUARD.test(b.body))
    .map((b) => b.name)
    .filter((n) => !n.startsWith('run'))
}

const results = actionFiles().flatMap((file) => {
  const src = readFileSync(join(DIR, file), 'utf8')
  const helpers = guardHelpers(src)
  const viaHelper = helpers.length ? new RegExp(`await\\s+(${helpers.join('|')})\\s*\\(`) : /$^/
  return blocks(src, 'run')
    .filter((b) => WRITES.test(b.body))
    .map((b) => ({
      id: `${file}  ${b.name}`,
      guarded: DIRECT_GUARD.test(b.body) || viaHelper.test(b.body),
    }))
})

describe('every mutating admin action is behind a role guard', () => {
  it('found the mutations, so this cannot pass by scanning nothing', () => {
    // The failure mode of every scanner in this repository that has gone wrong,
    // including three drafts of this one.
    expect(results.length).toBeGreaterThanOrEqual(40)
  })

  it('leaves none unguarded', () => {
    const unguarded = results.filter((r) => !r.guarded).map((r) => r.id)
    expect(
      unguarded,
      `these write to the database with no role check reachable from the body:\n  ${unguarded.join('\n  ')}`,
    ).toEqual([])
  })
})

/**
 * `support` is the read-only role - the brief calls it "Coupon-Partner
 * read-only" - and read-only has to mean it cannot reach a writer guard.
 */
describe('the read-only role cannot write', () => {
  const roles = readFileSync(join(process.cwd(), 'src/lib/admin/roles.ts'), 'utf8')

  it('is not an admin role, so requireAdminSession refuses it', () => {
    const fn = roles.slice(roles.indexOf('export function isAdminRole'))
    expect(fn.slice(0, 200)).not.toContain("'support'")
  })

  it('is not a staff role, so the catalogue writers refuse it', () => {
    const fn = roles.slice(roles.indexOf('export function isStaffRole'))
    expect(fn.slice(0, 200)).not.toContain("'support'")
  })

  it('does reach the panel, because reading is the whole point of the role', () => {
    const fn = roles.slice(roles.indexOf('export function isPanelRole'))
    expect(fn.slice(0, 200)).toContain("'support'")
  })
})
