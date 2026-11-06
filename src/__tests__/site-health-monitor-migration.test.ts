import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * S38. The uptime monitor lives entirely in migration 263, so the file is the
 * contract. These read it as text: the alert string and topic are what a phone
 * is subscribed to, and a quiet edit to either turns an outage into silence.
 */
const sql = readFileSync(
  join(process.cwd(), 'migrations/pending/263_site_health_monitor.sql'),
  'utf8',
)
// Everything after the header comment: the statements that actually run.
const body = sql.slice(sql.indexOf('\nBEGIN;'))

describe('migration 263: the site health monitor', () => {
  it('probes /api/ready on the vault base URL every five minutes', () => {
    expect(body).toContain("'ke-site-health-probe'")
    expect(body).toContain("'*/5 * * * *'")
    expect(body).toContain("|| '/api/ready'")
    expect(body).toContain("WHERE name = 'APP_BASE_URL'")
    expect(body).toContain('net.http_get(')
  })

  it('judges the probe one minute later, because pg_net answers after commit', () => {
    expect(body).toContain("'ke-site-health-resolve'")
    expect(body).toContain("'1-59/5 * * * *'")
    expect(body).toContain('FROM net._http_response r')
  })

  it('counts only a 200 as healthy', () => {
    expect(body).toContain('COALESCE(r.status_code = 200, false)')
  })

  it('alerts on the third consecutive failure, once per outage', () => {
    expect(body).toContain('IF v_streak >= 3 AND NOT v_alerted THEN')
    expect(body.match(/net\.http_post\(/g)).toHaveLength(1)
  })

  it('sends exactly "hey SITE down" to kenyon-ofir-limit and nothing else', () => {
    expect(body).toContain(
      "jsonb_build_object('topic', 'kenyon-ofir-limit', 'message', 'hey SITE down')",
    )
    expect(body).toContain("url     := 'https://ntfy.sh/'")
    // No recovery message: the only string sent to ntfy is the one above.
    expect(body.match(/'message'/g)).toHaveLength(1)
    expect(body).not.toMatch(/SITE (up|back|recovered)/i)
  })

  it('keeps the table and the functions away from anon and authenticated', () => {
    expect(body).toContain('ALTER TABLE public.site_health ENABLE ROW LEVEL SECURITY;')
    expect(body).toContain('REVOKE ALL ON public.site_health FROM PUBLIC, anon, authenticated;')
    expect(body).toContain(
      'REVOKE ALL ON FUNCTION public.site_health_resolve() FROM PUBLIC, anon, authenticated;',
    )
    expect(body).toContain(
      'REVOKE ALL ON FUNCTION public.site_health_probe()   FROM PUBLIC, anon, authenticated;',
    )
    expect(body).not.toContain('SECURITY DEFINER')
    expect(body).not.toContain('CREATE POLICY')
  })

  it('inlines no secret', () => {
    expect(body).not.toMatch(/Bearer|CRON_SECRET|eyJ/)
  })
})
