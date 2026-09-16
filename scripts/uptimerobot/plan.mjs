/**
 * The UptimeRobot monitor and alert contact for this site, as data.
 *
 * setup.mjs applies it; this module only decides what "correct" looks like so
 * a unit test can hold the decision still. Same split as scripts/axiom.
 *
 * WHAT IS DEFINED. One HTTP monitor on `/api/health` (200 when the database
 * answers, 503 when it does not, never cached) and one webhook alert contact
 * pointing back at `/api/alerts/uptimerobot`, which fans out to ntfy and
 * Telegram through the same `sendAlert` the money path uses.
 *
 * WHY A WEBHOOK AND NOT UPTIMEROBOT'S OWN TELEGRAM CONTACT. UptimeRobot can
 * post to Telegram directly, and that would leave the deployment with two
 * alert formats, two places to change a chat id, and no log line on our side
 * that the page happened. Relaying through our route keeps one channel, one
 * message shape, and a `uptime.alert_received` entry in the log drain that
 * says whether the phone was reached.
 *
 * THE SECRET IS IN THE URL. UptimeRobot signs nothing and cannot set headers,
 * so the shared secret rides as `?secret=`. It is visible in the UptimeRobot
 * dashboard to anyone with that login; rotating it is one env var and one
 * re-run of setup.mjs.
 */

export const MONITOR_NAME = 'KenyonExpress /api/health'
export const CONTACT_NAME = 'KenyonExpress alert relay'

/** UptimeRobot API v2 constants. */
export const MONITOR_TYPE_HTTP = 1
export const HTTP_METHOD_GET = 2
export const CONTACT_TYPE_WEBHOOK = 5

/** The free plan refuses anything under five minutes. */
export const MIN_INTERVAL_SECONDS = 300

/** Placeholders UptimeRobot substitutes into the webhook URL on each alert. */
export const PLACEHOLDERS = [
  'alertType',
  'monitorFriendlyName',
  'monitorURL',
  'alertDetails',
  'alertDuration',
  'sslExpiryDaysLeft',
]

export function normaliseBaseUrl(baseUrl) {
  const url = new URL(baseUrl)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(`base URL must be https: ${baseUrl}`)
  }
  return url.origin
}

export function webhookUrl({ baseUrl, secret }) {
  if (!secret || secret.length < 20)
    throw new Error('UPTIMEROBOT_WEBHOOK_SECRET must be at least 20 characters')
  const url = new URL('/api/alerts/uptimerobot', normaliseBaseUrl(baseUrl))
  url.searchParams.set('secret', secret)
  // Placeholders go in raw: URLSearchParams would encode the asterisks and
  // UptimeRobot only substitutes the literal `*name*` form.
  const params = PLACEHOLDERS.map((name) => `${name}=*${name}*`).join('&')
  return `${url.toString()}&${params}`
}

export function desiredMonitor({ baseUrl, intervalSeconds = MIN_INTERVAL_SECONDS }) {
  const interval = Math.max(MIN_INTERVAL_SECONDS, Number(intervalSeconds) || MIN_INTERVAL_SECONDS)
  return {
    friendly_name: MONITOR_NAME,
    url: new URL('/api/health', normaliseBaseUrl(baseUrl)).toString(),
    type: MONITOR_TYPE_HTTP,
    http_method: HTTP_METHOD_GET,
    interval,
    timeout: 30,
  }
}

export function desiredContact({ baseUrl, secret }) {
  return {
    type: CONTACT_TYPE_WEBHOOK,
    friendly_name: CONTACT_NAME,
    value: webhookUrl({ baseUrl, secret }),
  }
}

/** `id_threshold_recurrence`: alert at once, do not repeat. */
export function contactSpec(contactId) {
  return `${contactId}_0_0`
}

/**
 * Decide what setup.mjs has to do, given what the account already holds.
 *
 * Matching is by friendly name on both objects, because ids are only known
 * after creation and a URL changes on every secret rotation. `update` lists
 * only the fields that differ, so the log of a run says what changed.
 */
export function planChanges({ monitors = [], contacts = [], monitor, contact }) {
  const existingContact = contacts.find((c) => c.friendly_name === CONTACT_NAME)
  const contactPlan = !existingContact
    ? { action: 'create' }
    : String(existingContact.value) !== contact.value
      ? { action: 'update', id: existingContact.id, changes: { value: contact.value } }
      : { action: 'keep', id: existingContact.id }

  const existingMonitor = monitors.find((m) => m.friendly_name === MONITOR_NAME)
  let monitorPlan
  if (!existingMonitor) {
    monitorPlan = { action: 'create' }
  } else {
    const changes = {}
    for (const key of ['url', 'interval', 'timeout', 'http_method']) {
      if (key in existingMonitor && String(existingMonitor[key]) !== String(monitor[key])) {
        changes[key] = monitor[key]
      }
    }
    monitorPlan =
      Object.keys(changes).length > 0
        ? { action: 'update', id: existingMonitor.id, changes }
        : { action: 'keep', id: existingMonitor.id }
  }

  return { contact: contactPlan, monitor: monitorPlan }
}
