/**
 * Sentry's webhook, read and turned into a phone push. Pure: no fetch, no
 * env, so the decisions are unit tested and the route is a thin shell.
 *
 * WHY A RELAY WHEN SENTRY HAS ITS OWN NOTIFICATIONS. Sentry notifies by
 * email, and email is the channel this project measured as unread
 * (docs/MONITORING.md: ntfy is "the only alert channel that survived"). The
 * two metric alerts `scripts/sentry-alert-rules.mjs` provisions were emailing
 * a team inbox nobody opens, which is the same as not alerting. This routes
 * them to the phone through the same `sendAlert` every money-path alarm uses.
 *
 * WHAT IS RELAYED, AND WHY THE LIST IS SHORT. ARCHITECTURE-OBSERVABILITY §4:
 * capture broadly in Sentry, alert narrowly on ntfy. A relay that pages on
 * every Sentry issue would be the phone buzzing for a crawler hitting a dead
 * URL, and the channel dies. So:
 *
 *   - `metric_alert`: the two provisioned rate rules (error rate spike, RLS
 *     denial spike). Critical is urgent, warning is high, resolved is quiet.
 *   - `event_alert`: an issue alert rule firing. Relayed only when the event
 *     is from PRODUCTION; a laptop reporting into the same project
 *     (`SENTRY_DSN` is in `.env.local`) is acknowledged and dropped. Which
 *     rules fire is Sentry's decision and the rule's own frequency throttles
 *     it; this side only refuses non-production.
 *   - `issue` (created/resolved/assigned/...): acknowledged, never relayed.
 *     An issue carries no environment, so "created" would page for every
 *     laptop error; the event alert above is the production-filtered form.
 *   - `installation`: the integration being installed or removed. 200, no
 *     push; Sentry retries a non-2xx and the handshake would loop.
 *
 * Two payload shapes are read. The internal-integration form (signed, with a
 * `sentry-hook-resource` header naming the kind) and the legacy "WebHooks"
 * plugin form (no header, the event at the top level), which is what an
 * issue alert rule's "Send a notification via WebHooks" action posts.
 */

export type SentryHookResource =
  | 'event_alert'
  | 'metric_alert'
  | 'issue'
  | 'installation'
  | 'error'
  | 'comment'

export type SentryAlert =
  | {
      kind: 'event_alert'
      rule: string
      title: string
      level: string | null
      environment: string | null
      release: string | null
      url: string | null
    }
  | {
      kind: 'metric_alert'
      action: 'critical' | 'warning' | 'resolved'
      rule: string
      environment: string | null
      description: string | null
      url: string | null
    }
  | { kind: 'issue'; action: string; title: string | null }
  | { kind: 'installation'; action: string }

type Bag = Record<string, unknown>

function bag(value: unknown): Bag | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** `tags` arrives as `[["environment","production"], ...]` on an event. */
function tagFromPairs(tags: unknown, name: string): string | null {
  if (!Array.isArray(tags)) return null
  for (const pair of tags) {
    if (Array.isArray(pair) && pair[0] === name) return str(pair[1])
    const asBag = bag(pair)
    if (asBag && asBag.key === name) return str(asBag.value)
  }
  return null
}

function eventAlert(rule: string, event: Bag): SentryAlert {
  return {
    kind: 'event_alert',
    rule,
    title: str(event.title) ?? str(event.message) ?? str(event.culprit) ?? 'error',
    level: str(event.level),
    environment: str(event.environment) ?? tagFromPairs(event.tags, 'environment'),
    release: str(event.release) ?? tagFromPairs(event.tags, 'release'),
    url: str(event.web_url) ?? str(event.issue_url) ?? str(event.url),
  }
}

/**
 * `resource` is the `sentry-hook-resource` header, absent on the legacy
 * plugin form. Returns null for a body that is none of the shapes above.
 */
export function parseSentryAlert(resource: string | null, body: unknown): SentryAlert | null {
  const root = bag(body)
  if (!root) return null
  const data = bag(root.data) ?? {}
  const action = str(root.action)

  switch (resource) {
    case 'event_alert': {
      const event = bag(data.event)
      if (!event) return null
      const rule = str(data.triggered_rule) ?? str(bag(data.issue_alert)?.title) ?? 'issue alert'
      return eventAlert(rule, event)
    }
    case 'metric_alert': {
      const metric = bag(data.metric_alert)
      if (!metric || !action) return null
      if (action !== 'critical' && action !== 'warning' && action !== 'resolved') return null
      const alertRule = bag(metric.alert_rule)
      return {
        kind: 'metric_alert',
        action,
        rule: str(alertRule?.name) ?? str(metric.title) ?? 'metric alert',
        environment: str(alertRule?.environment),
        description: str(data.description_text) ?? str(data.description_title),
        url: str(data.web_url) ?? str(metric.web_url),
      }
    }
    case 'issue': {
      const issue = bag(data.issue)
      if (!issue || !action) return null
      return { kind: 'issue', action, title: str(issue.title) }
    }
    case 'installation':
      return { kind: 'installation', action: action ?? 'unknown' }
    case null:
    case undefined: {
      // Legacy plugin: the event is at the top level, next to `project`.
      const event = bag(root.event)
      if (!event || !str(root.project)) return null
      const rules = Array.isArray(root.triggering_rules) ? root.triggering_rules : []
      const rule = str(rules[0]) ?? 'issue alert'
      return eventAlert(rule, {
        ...event,
        title: str(event.title) ?? str(root.message),
        level: str(event.level) ?? str(root.level),
        culprit: str(event.culprit) ?? str(root.culprit),
        url: str(root.url),
      })
    }
    default:
      return null
  }
}

export type RelayDecision = { relay: true } | { relay: false; reason: string }

/** The narrow part. Everything not listed here is acknowledged and dropped. */
export function decideSentryRelay(alert: SentryAlert): RelayDecision {
  switch (alert.kind) {
    case 'metric_alert':
      return { relay: true }
    case 'event_alert':
      return alert.environment === 'production'
        ? { relay: true }
        : {
            relay: false,
            reason: `environment ${alert.environment ?? 'unknown'} is not production`,
          }
    case 'issue':
      return { relay: false, reason: 'issue lifecycle carries no environment' }
    case 'installation':
      return { relay: false, reason: 'installation handshake' }
  }
}

export type FormattedSentryAlert = {
  /** ASCII, because ntfy reads the header as ASCII (alert.ts). */
  title: string
  /** Hebrew body. */
  message: string
  priority: 'default' | 'high' | 'urgent'
  tags: string[]
}

function shortRelease(release: string | null): string | null {
  if (!release) return null
  return /^[0-9a-f]{40}$/i.test(release) ? release.slice(0, 7) : release
}

/**
 * Only for alerts `decideSentryRelay` accepted; `issue` and `installation`
 * are formatted too so the type is total, and they read as informational.
 */
export function formatSentryAlert(alert: SentryAlert): FormattedSentryAlert {
  switch (alert.kind) {
    case 'metric_alert': {
      const where = alert.url ? `\nקישור: ${alert.url}` : ''
      const what = alert.description ? `\n${alert.description}` : ''
      if (alert.action === 'critical') {
        return {
          title: `KE Sentry CRITICAL: ${alert.rule}`,
          priority: 'urgent',
          tags: ['rotating_light'],
          message: `סף קריטי נחצה ב-Sentry.${what}${where}`,
        }
      }
      if (alert.action === 'warning') {
        return {
          title: `KE Sentry warning: ${alert.rule}`,
          priority: 'high',
          tags: ['warning'],
          message: `סף אזהרה נחצה ב-Sentry.${what}${where}`,
        }
      }
      return {
        title: `KE Sentry resolved: ${alert.rule}`,
        priority: 'default',
        tags: ['white_check_mark'],
        message: `ההתראה נסגרה.${where}`,
      }
    }
    case 'event_alert': {
      const release = shortRelease(alert.release)
      return {
        title: `KE Sentry: ${alert.rule}`,
        priority: alert.level === 'fatal' ? 'urgent' : 'high',
        tags: ['bug'],
        message: [
          alert.title,
          `סביבה: ${alert.environment ?? 'לא ידוע'}`,
          release ? `גרסה: ${release}` : null,
          alert.url ? `קישור: ${alert.url}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      }
    }
    case 'issue':
      return {
        title: `KE Sentry issue ${alert.action}`,
        priority: 'default',
        tags: ['information_source'],
        message: alert.title ?? '',
      }
    case 'installation':
      return {
        title: `KE Sentry integration ${alert.action}`,
        priority: 'default',
        tags: ['information_source'],
        message: 'האינטגרציה של Sentry עודכנה.',
      }
  }
}
