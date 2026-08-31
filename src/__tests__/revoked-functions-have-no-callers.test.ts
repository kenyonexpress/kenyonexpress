import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY FUNCTION A PENDING MIGRATION REVOKES MUST HAVE NO CLIENT CALLER LEFT,
 * AND "CLIENT" MEANS BOTH APPS.
 *
 * `143_revoke_unused_definer_execute.sql` was written on a measurement that
 * ended "...and zero rpc() callsites in src/". One of its six functions,
 * `supplier_app_context`, has exactly one caller in the repo:
 *
 *     apps/mobile/src/lib/supplier/api.ts:64
 *
 * The supplier till is an Expo app in a workspace package, it talks to the same
 * project with the anon key and the cashier's session, so the call lands as
 * `authenticated` - the role the file was about to revoke. Applying it would
 * have stopped every till in the field from scanning, and nothing in the web
 * app's logs would have said a word, because `loadSupplierContext` returns null
 * on error and the screen reads that as "this device belongs to no supplier".
 *
 * The bug was not the SQL. It was the word `src/` in the audit that produced it.
 * So this test is deliberately not about migration 125: it re-derives the
 * revoke list from whatever is in `migrations/pending/` today and checks it
 * against every TypeScript file in BOTH trees. A future revoke of a function
 * the till uses fails here, before anyone types `apply_migration`.
 *
 * A CALLER IS NOT AUTOMATICALLY A COLLISION. The question a revoke asks is
 * which ROLE the call arrives as, and a call made on `createAdminClient()`
 * arrives as `service_role`, which none of these files touch. Deciding that
 * statically is not something a regex can do honestly, so the exceptions are
 * listed by name below with their reason. A new caller of a revoked function
 * therefore fails this test and has to be classified by a person - which is the
 * whole point, because that classification is exactly what nobody did for the
 * till app.
 *
 * WHAT IT CANNOT SEE, stated so nobody reads more into a green run: a call
 * built from a variable (`rpc(name)`), a raw fetch to `/rest/v1/rpc/...`, and
 * any caller outside this repo. It catches the literal form, which is the form
 * all 30-odd callsites here actually use.
 */

/**
 * Revoked functions that DO have callers, where every caller runs on the
 * service-role client and so keeps working after the revoke.
 *
 * The value is the exact file list, not a boolean: a NEW file calling one of
 * these fails the comparison, because the new caller might be on a session
 * client and nothing here would otherwise notice.
 */
const SERVICE_ROLE_CALLERS: Record<string, string[]> = {
  // `145_revoke_check_rate_limit_execute.sql` revokes anon/authenticated only.
  // Both callers below build the client with `createAdminClient()`, which
  // authenticates as service_role and is untouched by that file. The revoke is
  // in fact what makes these two the ONLY possible callers.
  //
  // CLASSIFIED 2026-08-21, and the reclassification is what this list is for.
  // The call moved out of `lib/utils/rate-limit.ts` into
  // `lib/rate-limit/limiter.ts`, which is now the Postgres FALLBACK behind the
  // Upstash sliding window. It is the same `createAdminClient()` call in a new
  // file, and `utils/rate-limit.ts` no longer names `check_rate_limit` at all -
  // it delegates. This test failed on that move, which is correct behaviour: it
  // refuses to let a caller relocate without a person saying which role it
  // arrives as.
  check_rate_limit: ['src/lib/health/checks.ts', 'src/lib/rate-limit/limiter.ts'],
  // `143_revoke_unused_definer_execute.sql` takes EXECUTE away from PUBLIC,
  // anon and authenticated, and leaves service_role. The single caller builds
  // its client with `createAdminClient()`, so it arrives as service_role and is
  // untouched.
  //
  // This entry is the classification 125's own audit skipped for another of its
  // functions, and it points the other way: 125 justified this revoke with
  // "zero rpc() callsites", which was true when it was written and is now
  // false. The revoke is still right, and is in fact MORE right than before.
  // `fn_ensure_referral_code(p_user_id uuid)` never reads `auth.uid()`, so
  // while `authenticated` holds EXECUTE any signed-in customer who knows
  // another customer's uuid can read (and mint) that person's referral code.
  // `src/server/actions/referrals.ts` is the sanctioned path precisely because
  // it takes the uuid from the session and never from a caller.
  fn_ensure_referral_code: ['src/server/actions/referrals.ts'],
}

const PENDING_DIR = 'migrations/pending'
const CODE_ROOTS = ['src', 'apps']
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'coverage'])

/** Function names a pending migration takes EXECUTE away from a client role. */
function revokedFunctionNames(): string[] {
  const dir = resolve(process.cwd(), PENDING_DIR)
  const names = new Set<string>()

  for (const file of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, file), 'utf8')
    for (const rawLine of sql.split('\n')) {
      const line = rawLine.trim()
      // Comment lines quote statements constantly in this directory - rollback
      // blocks, verification queries, the "what this does not do" sections. Only
      // an executable line revokes anything.
      if (line.startsWith('--') || line.length === 0) continue
      const match = /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(\w+)/i.exec(line)
      if (match?.[1]) names.add(match[1])
    }
  }
  return [...names].sort()
}

function typescriptFilesUnder(root: string): string[] {
  const start = resolve(process.cwd(), root)
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) found.push(full)
    }
  }
  walk(start)
  return found
}

/** Every `rpc('name')` in the repo, mapped to the files that call it. */
function rpcCallsites(): Map<string, string[]> {
  const calls = new Map<string, string[]>()
  for (const root of CODE_ROOTS) {
    for (const file of typescriptFilesUnder(root)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/gi)) {
        const name = match[1] as string
        const where = file.slice(resolve(process.cwd()).length + 1)
        calls.set(name, [...(calls.get(name) ?? []), where])
      }
    }
  }
  return calls
}

describe('pending revokes versus real callers', () => {
  it('revokes nothing that a session-client caller still needs', () => {
    const callers = rpcCallsites()
    const collisions = revokedFunctionNames()
      .filter((name) => callers.has(name))
      .filter((name) => {
        const allowed = SERVICE_ROLE_CALLERS[name]
        if (!allowed) return true
        const actual = [...(callers.get(name) ?? [])].sort()
        return JSON.stringify(actual) !== JSON.stringify([...allowed].sort())
      })
      .map((name) => `${name} <- ${callers.get(name)?.join(', ')}`)

    expect(collisions).toEqual([])
  })

  it('still sees the till app, so a green run above means something', () => {
    // Guards the guard. If the walk ever stops reaching apps/ - a renamed
    // directory, a skip list that grows - the test above passes vacuously and
    // the next revoke of a mobile-only function goes through unnoticed.
    const callers = rpcCallsites()
    expect(callers.get('supplier_app_context')).toEqual(['apps/mobile/src/lib/supplier/api.ts'])
  })

  it('reads a non-empty revoke list out of the pending directory', () => {
    // The same vacuity check on the other input.
    expect(revokedFunctionNames().length).toBeGreaterThan(0)
  })
})
