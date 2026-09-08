#!/usr/bin/env node
/**
 * RE-RUNS THE AUTHORIZATION SWEEP THAT OTHERWISE ONLY HAPPENS BY HAND.
 *
 * WHY THIS IS NOT COVERED BY THE TEST SUITE. `rls-role-boundaries.test.ts`
 * signs in as four seeded fixtures and asserts what each can reach. It is the
 * right test and it is currently SKIPPED - thirteen tests, every run - because
 * the fixture users do not exist in this project. It skips rather than passing
 * falsely, which is correct, and it also means role separation has no automated
 * check at all right now.
 *
 * This is the check that can run without fixtures, because it asks the
 * CATALOGUE rather than a session: not "can this user read that row" but "is
 * there any way in that nobody is guarding". It needs one credential and
 * creates no users.
 *
 * WHAT IT ASSERTS, and why each one is the shape of a real breach:
 *
 *  1. Every table in `public` has RLS enabled. A table without it is readable
 *     by anyone holding the anon key, which is in the browser bundle.
 *
 *  2. `anon` holds no INSERT/UPDATE/DELETE except on the tables named below.
 *     Guest carts genuinely need it; anything else acquiring it is a hole.
 *
 *  3. Every SECURITY DEFINER function that `anon` or `authenticated` may
 *     execute either takes no caller-supplied identity, or authorizes
 *     internally. A definer function runs as its OWNER, so one that trusts a
 *     `p_user_id` argument hands any signed-in caller anybody else's data.
 *     That exact class was live in this project before
 *     (`fn_ensure_referral_code`) and is now revoked; this is what notices it
 *     coming back.
 *
 *  4. Every SECURITY DEFINER function pins `search_path`. An unpinned one runs
 *     as its owner while resolving names against a path the caller may
 *     influence.
 *
 *  5. `profiles` cannot be self-escalated. The UPDATE policy's WITH CHECK
 *     constrains only `id`, so the column guard has to come from the
 *     `enforce_profile_privilege_columns` trigger - and if that trigger is ever
 *     dropped, RLS alone would let any signed-in customer set their own role to
 *     super_admin and walk through every requireAdminSession guard in the app,
 *     because those guards read the column the attacker just wrote.
 *
 * Rule 5 is the one to keep. The policy looks safe in isolation and is not; the
 * safety lives in a trigger a schema change could remove without touching a
 * single policy.
 *
 * TWO INPUTS, THE SAME ARRANGEMENT check-rls.mjs USES AND FOR THE SAME REASON.
 * These are catalogue queries - pg_class, pg_proc, pg_trigger - and PostgREST
 * cannot read those at all, whatever key it holds. So:
 *
 *   1. A Postgres connection, when SUPABASE_DB_URL or DATABASE_URL is set.
 *      Fully automatic; this is the CI path.
 *   2. `--sql` prints the one statement, and `--from <file>` reads the rows
 *      back. This is the path on a machine that has the project keys but not
 *      the connection string, which is the case here: the operator runs the
 *      statement through the Supabase MCP tool and pipes the result in.
 *
 * The verdict is identical either way. What is NOT offered is a third path
 * that guesses: a security audit that cannot reach the database must say so
 * and exit non-zero, never report "no gaps".
 *
 *   node scripts/audit-role-separation.mjs               # uses SUPABASE_DB_URL
 *   node scripts/audit-role-separation.mjs --sql         # print the query
 *   node scripts/audit-role-separation.mjs --from m.json # MCP output
 *
 * Exit: 0 clean, 1 findings, 2 could not run.
 */

import { readFileSync } from 'node:fs'

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? null : (process.argv[i + 1] ?? null)
}
const JSON_OUT = process.argv.includes('--json')
const PRINT_SQL = process.argv.includes('--sql')
const FROM = arg('from')

const fail = (msg) => {
  console.error(`audit-role-separation: ${msg}`)
  process.exit(2)
}

/**
 * Tables `anon` is allowed to write, with the reason. A guest cart is written
 * by somebody who has not signed in; that is what a guest cart IS.
 */
const ANON_WRITE_ALLOWED = new Map([['carts', 'guest carts, scoped by the session_id cookie']])

/**
 * Definer functions that take an identity-shaped argument and are SAFE, with
 * the reason each one is. Anything not on this list that takes such an argument
 * and is callable by anon or authenticated is reported.
 */
const IDENTITY_ARG_ALLOWED = new Map([
  ['is_supplier_member', 'takes a supplier id, not a user id; answers only about the caller'],
  ['is_supplier_owner', 'same shape as is_supplier_member'],
  ['is_supplier_order', 'takes an order id and joins it to the caller membership'],
  ['is_supplier_shipping_order', 'same shape as is_supplier_order'],
])

/**
 * The sweep, as one statement per rule. Kept as SQL rather than rebuilt in JS
 * because the catalogue is the source of truth and a JS reimplementation of
 * `has_table_privilege` would be a second thing to keep correct.
 */
const QUERIES = {
  rlsDisabled: `
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
     order by 1`,

  anonWritable: `
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and (has_table_privilege('anon', c.oid, 'INSERT')
         or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE'))
     order by 1`,

  unguardedDefiner: `
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args,
           has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
       and pg_get_function_identity_arguments(p.oid) ~* '(user_id|uid|p_user|account_id|customer_id|supplier_id|order_id|statement_id|staff_id)'
       and pg_get_functiondef(p.oid) !~* '(is_admin|has_role|is_support|is_supplier_member|is_supplier_owner|auth\\.uid)'
     order by 1`,

  mutableSearchPath: `
    select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proconfig is null
     order by 1`,

  profileGuard: `
    select count(*)::int as n
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc  f on f.oid = t.tgfoid
     where c.relname = 'profiles'
       and f.proname = 'enforce_profile_privilege_columns'
       and t.tgenabled <> 'D'
       and not t.tgisinternal`,
}

/**
 * The whole sweep as ONE statement, so the MCP path is a single copy-paste and
 * the connection path is a single round trip. Each rule contributes a labelled
 * row; `offenders` is a comma-joined list, or the literal '(none)'.
 *
 * Kept as SQL rather than rebuilt in JS because the catalogue is the source of
 * truth, and a JS reimplementation of has_table_privilege would be a second
 * thing to keep correct.
 */
const SWEEP = `
select 'rls-disabled' as rule, coalesce(string_agg(name, ', '), '(none)') as offenders from (
  ${QUERIES.rlsDisabled}) t
union all
select 'anon-writable', coalesce(string_agg(name, ', '), '(none)') from (
  ${QUERIES.anonWritable}) t
union all
select 'definer-trusts-argument', coalesce(string_agg(name, ', '), '(none)') from (
  ${QUERIES.unguardedDefiner}) t
union all
select 'definer-mutable-search-path', coalesce(string_agg(name, ', '), '(none)') from (
  ${QUERIES.mutableSearchPath}) t
union all
select 'profile-escalation-guard-triggers', (${QUERIES.profileGuard})::text`

if (PRINT_SQL) {
  console.log(SWEEP)
  process.exit(0)
}

/**
 * Rows in, verdict out. Split from the fetching so both inputs are judged by
 * exactly the same code - the property that makes the MCP path trustworthy.
 */
function judge(rows) {
  const findings = []
  const by = new Map(rows.map((r) => [r.rule, String(r.offenders ?? '')]))
  const listed = (rule) => {
    const raw = by.get(rule)
    if (raw === undefined) fail(`the measurement is missing the '${rule}' row`)
    return raw === '(none)'
      ? []
      : raw
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
  }

  for (const name of listed('rls-disabled')) {
    findings.push({ rule: 'rls-disabled', subject: name, detail: 'RLS is off on a public table' })
  }

  for (const name of listed('anon-writable')) {
    if (ANON_WRITE_ALLOWED.has(name)) continue
    findings.push({ rule: 'anon-writable', subject: name, detail: 'anon holds a write grant' })
  }

  for (const name of listed('definer-trusts-argument')) {
    if (IDENTITY_ARG_ALLOWED.has(name)) continue
    findings.push({
      rule: 'definer-trusts-argument',
      subject: name,
      detail:
        'SECURITY DEFINER, caller-executable, takes an identity-shaped argument and authorizes nothing',
    })
  }

  for (const name of listed('definer-mutable-search-path')) {
    findings.push({
      rule: 'definer-mutable-search-path',
      subject: name,
      detail: 'SECURITY DEFINER with no search_path pinned',
    })
  }

  const guards = Number(by.get('profile-escalation-guard-triggers') ?? '0')
  if (!Number.isFinite(guards) || guards < 1) {
    findings.push({
      rule: 'profile-escalation-open',
      subject: 'profiles',
      detail:
        'enforce_profile_privilege_columns is missing or disabled; the UPDATE policy checks only id, ' +
        'so any signed-in user could set their own role',
    })
  }

  return findings
}

async function measure() {
  if (FROM) {
    const parsed = JSON.parse(readFileSync(FROM, 'utf8'))
    const rows = Array.isArray(parsed) ? parsed : (parsed.result ?? parsed.rows)
    if (!Array.isArray(rows)) fail(`${FROM} does not contain an array of rows`)
    return rows
  }

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (!dbUrl) {
    fail(
      'no input. Set SUPABASE_DB_URL, or run --sql through the Supabase MCP\n' +
        '  and pass the rows back with --from <file>. This audit will not\n' +
        '  report "no gaps" without having read the database.',
    )
  }

  const { default: postgres } = await import('postgres')
  const sql = postgres(dbUrl, { max: 1, prepare: false, onnotice: () => {} })
  try {
    return await sql.unsafe(SWEEP)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

const main = async () => {
  const findings = judge(await measure())

  if (JSON_OUT) {
    console.log(JSON.stringify({ findings }, null, 2))
  } else {
    console.log('audit-role-separation: five rules checked')
    if (findings.length === 0) console.log('  no gaps')
    for (const f of findings) console.error(`  ${f.rule.padEnd(28)} ${f.subject}: ${f.detail}`)
  }
  process.exit(findings.length === 0 ? 0 : 1)
}

main().catch((e) => fail(e.stack ?? String(e)))
