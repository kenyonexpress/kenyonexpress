import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FIVE_XX_MONITOR,
  SLOW_QUERY_MONITOR,
  buildMonitors,
  buildNotifiers,
  planUpsert,
} from './monitors.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const source = (path) => readFileSync(join(ROOT, path), 'utf8')

/**
 * The monitors query event NAMES, and nothing ties a string in an APL query to
 * the call site that emits it. Renaming `db.query_slow` would leave a monitor
 * that never fires and never errors -- the same silent-orphan failure the
 * PostHog funnel taxonomy test guards against, so the same guard: each queried
 * event must appear verbatim in the module that emits it.
 */
describe('monitored events exist at their emitting call sites', () => {
  const queries = buildMonitors('ds')
    .map((monitor) => monitor.aplQuery)
    .join('\n')

  it('request.completed and request.failed come from with-request-log.ts', () => {
    const emitter = source('src/lib/observability/with-request-log.ts')
    for (const event of ['request.completed', 'request.failed']) {
      expect(queries).toContain(`'${event}'`)
      expect(emitter).toContain(`'${event}'`)
    }
  })

  it('db.query_slow comes from query-log-fetch.ts', () => {
    expect(queries).toContain(`'db.query_slow'`)
    expect(source('src/lib/supabase/query-log-fetch.ts')).toContain(`'db.query_slow'`)
  })

  it('the 5xx query matches the status field with-request-log actually logs', () => {
    expect(queries).toContain('status >= 500')
    expect(source('src/lib/observability/with-request-log.ts')).toContain('status: response.status')
  })
})

describe('buildMonitors', () => {
  it('defines exactly the two rules, as threshold monitors on the given dataset', () => {
    const monitors = buildMonitors('kenyon-logs')
    expect(monitors.map((monitor) => monitor.name)).toEqual([FIVE_XX_MONITOR, SLOW_QUERY_MONITOR])
    for (const monitor of monitors) {
      expect(monitor.type).toBe('Threshold')
      expect(monitor.operator).toBe('AboveOrEqual')
      expect(monitor.aplQuery).toContain(`['kenyon-logs']`)
      // A window shorter than the check interval would leave unmonitored gaps.
      expect(monitor.rangeMinutes).toBeGreaterThanOrEqual(monitor.intervalMinutes)
      // Empty logs are a quiet shop at 4am, not an incident.
      expect(monitor.alertOnNoData).toBe(false)
    }
  })

  it('wires each monitor to its own notifier id, and tolerates missing ids for --dry', () => {
    const wired = buildMonitors('ds', {
      'kenyon-axiom-5xx': 'id-a',
      'kenyon-axiom-slow-query': 'id-b',
    })
    expect(wired[0].notifierIds).toEqual(['id-a'])
    expect(wired[1].notifierIds).toEqual(['id-b'])

    for (const monitor of buildMonitors('ds')) {
      expect(monitor.notifierIds).toEqual([])
    }
  })

  it('a single slow query cannot fire the slow-query rule', () => {
    const slow = buildMonitors('ds').find((monitor) => monitor.name === SLOW_QUERY_MONITOR)
    expect(slow.threshold).toBeGreaterThan(1)
  })
})

describe('buildNotifiers', () => {
  it('defaults to ntfy JSON publish on the same topic module alert.ts uses', () => {
    const notifiers = buildNotifiers({})
    expect(notifiers.map((notifier) => notifier.name)).toEqual([
      'kenyon-axiom-5xx',
      'kenyon-axiom-slow-query',
    ])
    for (const notifier of notifiers) {
      const webhook = notifier.properties.customWebhook
      expect(webhook.url).toBe('https://ntfy.sh')
      const body = JSON.parse(webhook.body)
      expect(body.topic).toBe('kenyon-ofir-limit')
      // ntfy reads the title as ASCII; Hebrew belongs in the message.
      expect(body.title).toMatch(/^[\x20-\x7E]+$/)
      expect(body.message.length).toBeGreaterThan(0)
    }
  })

  it('honours NTFY_TOPIC and NTFY_BASE_URL, trimming a trailing slash', () => {
    const [notifier] = buildNotifiers({ NTFY_TOPIC: 't', NTFY_BASE_URL: 'https://n.example/' })
    expect(notifier.properties.customWebhook.url).toBe('https://n.example')
    expect(JSON.parse(notifier.properties.customWebhook.body).topic).toBe('t')
  })

  it('switches every notifier to email when AXIOM_ALERT_EMAIL is set', () => {
    const notifiers = buildNotifiers({ AXIOM_ALERT_EMAIL: 'ops@example.com' })
    expect(notifiers).toHaveLength(2)
    for (const notifier of notifiers) {
      expect(notifier.properties).toEqual({ email: { emails: ['ops@example.com'] } })
    }
  })
})

describe('planUpsert', () => {
  it('creates what is absent and updates in place what exists, keyed on name', () => {
    const existing = [{ id: '17', name: FIVE_XX_MONITOR, threshold: 999 }]
    const desired = buildMonitors('ds')
    const plan = planUpsert(existing, desired)
    expect(plan.create.map((item) => item.name)).toEqual([SLOW_QUERY_MONITOR])
    expect(plan.update).toEqual([
      { id: '17', body: desired.find((monitor) => monitor.name === FIVE_XX_MONITOR) },
    ])
  })

  it('treats a null listing (--dry) as empty', () => {
    const plan = planUpsert(null, buildMonitors('ds'))
    expect(plan.create).toHaveLength(2)
    expect(plan.update).toHaveLength(0)
  })
})
