import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES } from '@/lib/analytics/events'
import { describe, expect, it } from 'vitest'

/**
 * AN EVENT NAME THE DATABASE DOES NOT KNOW IS THROWN AWAY WITH A 200.
 *
 * `fn_ingest_analytics_events` filters every incoming event against a name
 * whitelist and `CONTINUE`s past anything not on it. No error, no log, HTTP
 * 200. So a name that exists in this repo's registry but not in that function
 * is not a mismatch that shows up as a failure -- it is an event that
 * disappears, and the only symptom is a dashboard that is quietly missing a
 * funnel step.
 *
 * That is not hypothetical. Migration 151 shipped the whitelist with the eight
 * CLIENT names only, and all four SERVER names have been discarded ever since,
 * while `trackServerEvent` has been emitting them since 29f74812e. Read off the
 * deployed function body on 2026-09-06, the live list is:
 *
 *   page_view, view_product, view_category, add_to_cart,
 *   remove_from_cart, checkout_step, web_vital, whatsapp_click
 *
 * `begin_checkout`, `purchase`, `voucher_redeemed` and `order_refunded` are on
 * none of it. Every server-side money event the funnel emits goes nowhere.
 *
 * `migrations/pending/169` is the fix and it needs approval before it touches
 * production. This test does not assert the live database -- it cannot, and a
 * test that needed production to be right would fail for the next month. What
 * it pins is the thing that is actually in this repo's control: **the pending
 * migration must cover every name the registry can emit.** If someone adds a
 * ninth client event or a fifth server event and does not widen 169, this goes
 * red at the moment the name is added rather than silently after it deploys.
 *
 * When 169 is applied, move this to read `migrations/applied/` and it keeps
 * working unchanged. The invariant is the same either way.
 */

const MIGRATION = 'migrations/pending/169_analytics_server_event_names.sql'

/**
 * The quoted names inside the whitelist of the `CREATE OR REPLACE` in 169.
 *
 * Parsed from the `NOT IN (...)` list rather than from the whole file, so a
 * name that happens to appear in a comment cannot make this pass.
 */
function migrationWhitelist(): string[] {
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), 'utf8')
  const list = /v_name\s+NOT\s+IN\s*\(([\s\S]*?)\)/i.exec(sql)?.[1]
  if (!list) throw new Error(`could not find the NOT IN whitelist in ${MIGRATION}`)
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string)
}

describe('the analytics registry and the pending ingest migration', () => {
  it('parses a real whitelist out of the migration, not an empty match', () => {
    // Without this the whole file passes vacuously if the regex stops matching.
    const names = migrationWhitelist()
    expect(names.length).toBeGreaterThanOrEqual(8)
    expect(names).toContain('page_view')
  })

  it('covers every server event name the funnel can emit', () => {
    // The four that are being discarded in production today. This is the
    // assertion that would have caught 151 narrowing the list.
    const whitelist = migrationWhitelist()
    const missing = SERVER_EVENT_NAMES.filter((name) => !whitelist.includes(name))

    expect(
      missing,
      `these server events would be silently discarded by the ingest function: ${missing.join(', ')}. Add them to ${MIGRATION}, or they will return HTTP 200 and vanish.`,
    ).toEqual([])
  })

  it('covers every client event name too', () => {
    const whitelist = migrationWhitelist()
    const missing = CLIENT_EVENT_NAMES.filter((name) => !whitelist.includes(name))

    expect(
      missing,
      `these client events would be silently discarded by the ingest function: ${missing.join(', ')}.`,
    ).toEqual([])
  })

  it('does not whitelist a name the registry cannot emit', () => {
    // The other direction, and it is not pedantry: a name in the function that
    // nothing emits is either a rename that left its old name behind or an
    // event someone forgot to register, and both are worth knowing about.
    const known = new Set<string>([...CLIENT_EVENT_NAMES, ...SERVER_EVENT_NAMES])
    const unknown = migrationWhitelist().filter((name) => !known.has(name))

    expect(
      unknown,
      `the migration whitelists names no registry entry emits: ${unknown.join(', ')}.`,
    ).toEqual([])
  })
})
