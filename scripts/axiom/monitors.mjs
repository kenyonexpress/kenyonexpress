/**
 * Axiom alert rules, as data. setup.mjs applies them; this module only decides
 * what they are, so a unit test can hold the decisions still.
 *
 * WHAT IS DEFINED. Two threshold monitors over the structured log stream that
 * log.ts ships (src/lib/observability/log.ts):
 *
 *   - "5xx spike": `request.completed` with status >= 500, plus
 *     `request.failed` (a handler that threw never produced a status line, but
 *     the shopper saw a 500 all the same). Normal volume here is zero, exactly
 *     like the Sentry "Error rate spike" rule; 5 in 10 minutes means shoppers
 *     are hitting it right now, not that one cron hiccuped.
 *   - "slow queries": `db.query_slow`, which query-log-fetch.ts emits when a
 *     PostgREST/GoTrue round trip crosses SUPABASE_SLOW_QUERY_MS (1500ms
 *     default). One cold query after a deploy is expected and must not page;
 *     12 in 15 minutes is Supabase (or our SQL) degrading, which is the thing
 *     worth a person before it becomes the 5xx monitor's problem.
 *
 * WHERE ALERTS GO. One notifier per monitor, so the message can say which rule
 * fired without depending on Axiom's webhook template variables. Channel:
 * AXIOM_ALERT_EMAIL when set; otherwise ntfy, same topic module as
 * lib/observability/alert.ts. sentry-alert-rules.mjs kept ntfy money-only
 * because Sentry already had email configured -- Axiom has no email of its own,
 * and both of these rules are calibrated to "customers are affected NOW", which
 * is the bar alert.ts sets for that channel. Thresholds are deliberately high
 * so the channel stays quiet; loosen them here, in review, not in the UI.
 *
 * ntfy JSON publish goes to the BASE url with the topic in the body -- the
 * path-style publish alert.ts uses cannot carry a title through Axiom's
 * static-body webhook. Titles ASCII, body Hebrew, per alert.ts.
 */

export const FIVE_XX_MONITOR = 'KenyonExpress 5xx spike'
export const SLOW_QUERY_MONITOR = 'KenyonExpress slow queries'

const NOTIFIER_FOR = {
  [FIVE_XX_MONITOR]: 'kenyon-axiom-5xx',
  [SLOW_QUERY_MONITOR]: 'kenyon-axiom-slow-query',
}

function ntfyBody(topic, title, message) {
  return JSON.stringify({ topic, title, message, priority: 4, tags: ['rotating_light'] })
}

/**
 * One notifier per monitor, name-keyed for upsert. Email when
 * AXIOM_ALERT_EMAIL is set, ntfy otherwise -- see the header for why ntfy is
 * acceptable here despite the money-only rule on the runtime channel.
 */
export function buildNotifiers(env = process.env) {
  const email = env.AXIOM_ALERT_EMAIL
  if (email) {
    return Object.values(NOTIFIER_FOR).map((name) => ({
      name,
      properties: { email: { emails: [email] } },
    }))
  }

  const topic = env.NTFY_TOPIC || 'kenyon-ofir-limit'
  const base = (env.NTFY_BASE_URL || 'https://ntfy.sh').replace(/\/+$/, '')
  const webhook = (title, message) => ({
    customWebhook: {
      url: base,
      headers: { 'Content-Type': 'application/json' },
      body: ntfyBody(topic, title, message),
    },
  })

  return [
    {
      name: NOTIFIER_FOR[FIVE_XX_MONITOR],
      properties: webhook(
        'Axiom: 5xx spike',
        'קפיצה בתשובות 5xx באתר. פתח את דשבורד kenyon-errors ב-Axiom וסנן לפי request_id.',
      ),
    },
    {
      name: NOTIFIER_FOR[SLOW_QUERY_MONITOR],
      properties: webhook(
        'Axiom: slow queries',
        'שאילתות Supabase איטיות באופן מתמשך (מעל סף db.query_slow). בדוק את kenyon-errors ואת עומס ה-DB.',
      ),
    },
  ]
}

/**
 * The two monitors, name-keyed for upsert. `notifierIdByName` maps notifier
 * NAME -> Axiom id, because ids are minted by Axiom and only setup.mjs has
 * them; a missing id becomes an empty list rather than a crash so --dry can
 * print the payloads without a network round trip.
 */
export function buildMonitors(dataset, notifierIdByName = {}) {
  const table = `['${dataset}']`
  const wire = (monitorName) => {
    const id = notifierIdByName[NOTIFIER_FOR[monitorName]]
    return id ? [id] : []
  }

  return [
    {
      name: FIVE_XX_MONITOR,
      type: 'Threshold',
      description:
        'Server errors reaching shoppers: request.completed status>=500 or request.failed (handler threw). Managed by scripts/axiom/setup.mjs.',
      aplQuery: `${table} | where (event == 'request.completed' and status >= 500) or event == 'request.failed' | summarize count() by bin(_time, 5m)`,
      operator: 'AboveOrEqual',
      threshold: 5,
      intervalMinutes: 5,
      rangeMinutes: 10,
      alertOnNoData: false,
      notifierIds: wire(FIVE_XX_MONITOR),
    },
    {
      name: SLOW_QUERY_MONITOR,
      type: 'Threshold',
      description:
        'Sustained db.query_slow volume (Supabase round trips over SUPABASE_SLOW_QUERY_MS). Managed by scripts/axiom/setup.mjs.',
      aplQuery: `${table} | where event == 'db.query_slow' | summarize count() by bin(_time, 5m)`,
      operator: 'AboveOrEqual',
      threshold: 12,
      intervalMinutes: 5,
      rangeMinutes: 15,
      alertOnNoData: false,
      notifierIds: wire(SLOW_QUERY_MONITOR),
    },
  ]
}

/**
 * Splits desired objects into creates and updates against what Axiom already
 * holds, keyed on `name` -- the same upsert contract as the dashboards' uid
 * pinning and sentry-alert-rules.mjs. An update carries the existing id so the
 * caller can PUT in place; everything else about a rule may be edited freely.
 */
export function planUpsert(existing, desired) {
  const byName = new Map((existing ?? []).map((item) => [item.name, item]))
  const create = []
  const update = []
  for (const item of desired) {
    const current = byName.get(item.name)
    if (current) update.push({ id: current.id, body: item })
    else create.push(item)
  }
  return { create, update }
}
