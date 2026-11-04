import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 258 (S20): the T-7 and T-1 pg_cron jobs. Applied 04.11.2026; this pins the
 * file so a later edit cannot quietly bring back the three defects measured
 * on the 162 jobs (POST to a GET-only route, the apex host, a literal secret).
 */
const sql = readFileSync(
  resolve(process.cwd(), 'migrations/pending/258_expiry_cron_t7_t1.sql'),
  'utf8',
)
const body = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('258: expiry reminder schedule', () => {
  it('schedules exactly the two buckets against /api/cron/expiry', () => {
    expect(body).toMatch(/'ke-expiry-t7',\s*'20 23 \* \* \*'/)
    expect(body).toMatch(/'ke-expiry-t1',\s*'25 23 \* \* \*'/)
    expect(body).toContain("'/api/cron/expiry?days=7'")
    expect(body).toContain("'/api/cron/expiry?days=1'")
  })

  it('calls with GET only, never POST', () => {
    expect(body.match(/net\.http_get/g)).toHaveLength(2)
    expect(body).not.toContain('net.http_post')
  })

  it('reads the bearer and the base URL from the vault at run time', () => {
    expect(body.match(/name = 'CRON_SECRET'/g)?.length).toBeGreaterThanOrEqual(2)
    expect(body).toContain("'Bearer ' ||")
    expect(body).not.toMatch(/Bearer [A-Za-z0-9]/)
  })

  it('re-seeds the apex to www, since a bearer does not survive the 308', () => {
    expect(body).toContain("'https://www.kenyonexpress.co.il'")
    expect(body).toContain("= 'https://kenyonexpress.co.il'")
  })

  it('unschedules the dead push-expiry-reminders job', () => {
    expect(body).toContain("jobname = 'push-expiry-reminders'")
  })

  it('runs after the 23:15 sweep', () => {
    // Both minutes are after 15, the ke-expire-vouchers minute.
    for (const minute of [...body.matchAll(/'(\d+) 23 \* \* \*'/g)].map((m) => Number(m[1]))) {
      expect(minute).toBeGreaterThan(15)
    }
  })
})
