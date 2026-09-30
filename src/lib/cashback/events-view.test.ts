import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the shape of migration 249 (`cashback_events`), the STEP 13 ledger
 * view, to what the code reads. `getCashbackEvents` selects these columns
 * by name; a rename in the SQL would come back as 42703 at runtime and
 * nothing at type-check, because the view is typed by hand in database.ts.
 */
const sql = readFileSync(
  join(process.cwd(), 'migrations', 'pending', '249_cashback_events.sql'),
  'utf8',
)

describe('migration 249: cashback_events', () => {
  it('is a view over cashback_ledger, not a second ledger', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.cashback_events/)
    expect(sql).toMatch(/FROM public\.cashback_ledger/)
    expect(sql).not.toMatch(/CREATE TABLE[^;]*cashback_events/i)
  })

  it('exposes the four columns the step names, with agorot as the money column', () => {
    expect(sql).toMatch(/l\.order_id,/)
    expect(sql).toMatch(/l\.amount_agorot\s+AS agorot,/)
    expect(sql).toMatch(/l\.entry_type\s+AS reason,/)
    expect(sql).toMatch(/l\.created_at/)
    // The self-check inside the file names the same four.
    expect(sql).toMatch(/ARRAY\['order_id', 'agorot', 'reason', 'created_at'\]/)
  })

  it('runs as the caller so 177 RLS decides the rows, and anon holds nothing', () => {
    expect(sql).toMatch(/WITH \(security_invoker = true\)/)
    expect(sql).toMatch(/REVOKE ALL ON public\.cashback_events FROM anon;/)
    expect(sql).not.toMatch(/GRANT[^;]*TO anon/)
    expect(sql).toMatch(/GRANT SELECT ON public\.cashback_events TO authenticated;/)
  })

  it('refuses to run before 177 and reloads the API schema after', () => {
    expect(sql).toMatch(/to_regclass\('public\.cashback_ledger'\) IS NULL/)
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema';/)
  })
})
