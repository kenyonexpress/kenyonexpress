import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REMINDER_BUCKETS } from '@/lib/vouchers/expiry-reminders'
import { describe, expect, it } from 'vitest'

/**
 * THE REMINDER'S CLOCK AND ITS SELECTION RULE, PINNED TO THE TEXT THAT SHIPS.
 *
 * Three files describe how and when a coupon holder is reminded, and none of
 * them can be executed here: `migrations/pending/250_expiry_reminders_schedule.sql`
 * schedules the two cron routes through pg_cron + pg_net,
 * `migrations/pending/227_voucher_expiry_engine.sql` holds the selection
 * window, and `scripts/cron-jobs.json` is the schedule every other scheduler
 * is checked against. Each pin below is a mistake that was either made or is
 * one edit away:
 *
 *   - 162 scheduled twelve jobs with `net.http_post` against routes that
 *     export GET only; Next answers 405 and pg_cron records success.
 *   - 162 read the vault by `cron_secret` / `app_url`; production holds
 *     `CRON_SECRET` / `APP_BASE_URL`.
 *   - a schedule typed into SQL by hand can disagree with the manifest and
 *     nothing would say so.
 *   - the window's `+ 1` on the floor and the `> now()` guard are each one
 *     character, and `src/lib/vouchers/expiry-reminders.test.ts` tests the
 *     TypeScript mirror of them, not the SQL. This holds the SQL to the mirror.
 */

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const SCHEDULE_SQL = 'migrations/pending/250_expiry_reminders_schedule.sql'
const ENGINE_SQL = 'migrations/pending/227_voucher_expiry_engine.sql'
const MANIFEST = 'scripts/cron-jobs.json'
const ROUTE = 'src/app/api/cron/expire-vouchers/route.ts'

type Scheduled = { jobname: string; schedule: string; command: string }

function scheduledJobs(sql: string): Scheduled[] {
  const out: Scheduled[] = []
  const re = /cron\.schedule\(\s*'([^']+)',\s*'([^']+)',\s*\$cmd\$([\s\S]*?)\$cmd\$/g
  for (const m of sql.matchAll(re)) {
    out.push({ jobname: m[1] as string, schedule: m[2] as string, command: m[3] as string })
  }
  return out
}

describe('250: the reminder schedule', () => {
  const sql = read(SCHEDULE_SQL)
  const jobs = scheduledJobs(sql)
  const manifest = JSON.parse(read(MANIFEST)) as { jobs: { path: string; cron: string }[] }

  it('schedules the producer, the drain and the history prune, by name', () => {
    expect(jobs.map((j) => j.jobname).sort()).toEqual([
      'ke-cron-history-prune',
      'ke-expire-vouchers',
      'ke-notifications',
    ])
  })

  it('calls every route with GET, never POST', () => {
    const http = jobs.filter((j) => j.command.includes('/api/cron/'))
    expect(http).toHaveLength(2)
    for (const j of http) expect(j.command).toContain('net.http_get(')
    // The header names 162's http_post to explain it; the code may not use it.
    const code = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    expect(code).not.toContain('http_post')
  })

  it('uses the cron expression the manifest uses for the same path', () => {
    for (const j of jobs) {
      const path = j.command.match(/\/api\/cron\/[a-z-]+/)?.[0]
      if (!path) continue
      const entry = manifest.jobs.find((m) => m.path === path)
      expect(entry, `${path} is scheduled by 250 but not in ${MANIFEST}`).toBeDefined()
      expect(j.schedule, `${j.jobname} disagrees with the manifest`).toBe(entry?.cron)
      expect(
        existsSync(
          resolve(process.cwd(), 'src/app/api/cron', path.split('/').pop() as string, 'route.ts'),
        ),
      ).toBe(true)
    }
  })

  it('reads the vault by the names production holds, at run time, in every HTTP job', () => {
    for (const j of jobs.filter((j) => j.command.includes('/api/cron/'))) {
      expect(j.command).toContain("vault.decrypted_secrets where name = 'CRON_SECRET'")
      expect(j.command).toContain("vault.decrypted_secrets where name = 'APP_BASE_URL'")
    }
    // 162's names. A guard on these would raise with the secret one row away.
    expect(sql).not.toMatch(/name = '(cron_secret|app_url)'/)
  })

  it('carries no secret value of any shape', () => {
    expect(sql).not.toMatch(/sb_secret_|sb_publishable_|sbp_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{30,}/)
    expect(sql).not.toMatch(/Bearer\s+[A-Za-z0-9+/=_-]{24,}/)
  })

  it('refuses the apex host at apply time rather than failing at night', () => {
    expect(sql).toContain("v_host = 'kenyonexpress.co.il'")
    expect(sql).toContain('RAISE EXCEPTION')
  })

  it('leaves 162 alone and says why', () => {
    expect(sql).toMatch(/does not\s*(--\s*)?edit 162/)
  })
})

describe('227 and the route agree with the TypeScript mirror', () => {
  const engine = read(ENGINE_SQL)

  it('selects a half-open window per bucket, floor exclusive, bucket inclusive', () => {
    expect(engine).toContain('BETWEEN v_floor + 1 AND v_bucket')
    expect(engine).toContain(
      'v_floor := CASE WHEN v_i < v_count THEN v_sorted[v_i + 1] ELSE -1 END',
    )
  })

  it('counts Jerusalem calendar days and refuses a voucher already past now()', () => {
    expect(engine).toContain("(v.expires_at AT TIME ZONE 'Asia/Jerusalem')::date")
    expect(engine).toContain("(now() AT TIME ZONE 'Asia/Jerusalem')::date")
    expect(engine).toContain('AND v.expires_at > now()')
    expect(engine).toContain("v.status = 'issued'::public.voucher_status")
    expect(engine).toContain('AND pr.email IS NOT NULL')
  })

  it('keys the outbox row per voucher per bucket', () => {
    expect(engine).toContain("'voucher_expiring:' || v.id::text || ':' || v_bucket::text")
  })

  it('is called with the buckets the mirror carries', () => {
    expect(read(ROUTE)).toContain(`p_buckets: [${REMINDER_BUCKETS.join(', ')}]`)
  })
})
