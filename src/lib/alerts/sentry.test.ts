import { describe, expect, it } from 'vitest'
import { decideSentryRelay, formatSentryAlert, parseSentryAlert } from './sentry'

const integrationEvent = {
  action: 'triggered',
  data: {
    triggered_rule: 'New production issue',
    event: {
      event_id: 'e1',
      title: 'TypeError: cannot read properties of undefined',
      level: 'error',
      environment: 'production',
      release: '0123456789abcdef0123456789abcdef01234567',
      web_url: 'https://kenyonexpress.sentry.io/issues/42/events/e1/',
      issue_url: 'https://de.sentry.io/api/0/organizations/kenyonexpress/issues/42/',
      tags: [
        ['environment', 'production'],
        ['route_path', '/product/[slug]'],
      ],
    },
  },
  installation: { uuid: 'inst-1' },
  actor: { type: 'application', id: 'sentry', name: 'Sentry' },
}

describe('parseSentryAlert', () => {
  it('reads an event alert from the internal-integration form', () => {
    expect(parseSentryAlert('event_alert', integrationEvent)).toEqual({
      kind: 'event_alert',
      rule: 'New production issue',
      title: 'TypeError: cannot read properties of undefined',
      level: 'error',
      environment: 'production',
      release: '0123456789abcdef0123456789abcdef01234567',
      url: 'https://kenyonexpress.sentry.io/issues/42/events/e1/',
    })
  })

  it('falls back to the environment tag when the field is absent', () => {
    const { environment: _dropped, ...event } = integrationEvent.data.event
    const body = { ...integrationEvent, data: { ...integrationEvent.data, event } }
    expect(parseSentryAlert('event_alert', body)).toMatchObject({ environment: 'production' })
  })

  it('reads the legacy WebHooks plugin form, which has no resource header', () => {
    const legacy = {
      id: '42',
      project: 'kenyonexpress-web',
      project_name: 'kenyonexpress-web',
      level: 'error',
      culprit: 'GET /product/[slug]',
      message: 'TypeError: boom',
      url: 'https://kenyonexpress.sentry.io/issues/42/',
      triggering_rules: ['New production issue'],
      event: {
        event_id: 'e2',
        tags: [
          ['environment', 'production'],
          ['release', 'abc1234'],
        ],
      },
    }
    expect(parseSentryAlert(null, legacy)).toEqual({
      kind: 'event_alert',
      rule: 'New production issue',
      title: 'TypeError: boom',
      level: 'error',
      environment: 'production',
      release: 'abc1234',
      url: 'https://kenyonexpress.sentry.io/issues/42/',
    })
  })

  it('reads a metric alert and only its three actions', () => {
    const body = {
      action: 'critical',
      data: {
        metric_alert: {
          id: '7',
          alert_rule: { name: 'Error rate spike', environment: 'production' },
          title: 'Error rate spike',
        },
        description_text: '57 events in the last 60 minutes',
        web_url: 'https://kenyonexpress.sentry.io/alerts/7/',
      },
    }
    expect(parseSentryAlert('metric_alert', body)).toEqual({
      kind: 'metric_alert',
      action: 'critical',
      rule: 'Error rate spike',
      environment: 'production',
      description: '57 events in the last 60 minutes',
      url: 'https://kenyonexpress.sentry.io/alerts/7/',
    })
    expect(parseSentryAlert('metric_alert', { ...body, action: 'acknowledged' })).toBeNull()
  })

  it('reads issue and installation lifecycle payloads', () => {
    expect(
      parseSentryAlert('issue', { action: 'resolved', data: { issue: { title: 'Boom' } } }),
    ).toEqual({ kind: 'issue', action: 'resolved', title: 'Boom' })
    expect(parseSentryAlert('installation', { action: 'created', data: {} })).toEqual({
      kind: 'installation',
      action: 'created',
    })
  })

  it('returns null for anything else', () => {
    expect(parseSentryAlert('event_alert', { action: 'triggered', data: {} })).toBeNull()
    expect(parseSentryAlert('comment', { action: 'created' })).toBeNull()
    expect(parseSentryAlert(null, { hello: 'world' })).toBeNull()
    expect(parseSentryAlert(null, 'text')).toBeNull()
    expect(parseSentryAlert(null, null)).toBeNull()
  })
})

describe('decideSentryRelay', () => {
  it('relays metric alerts and production event alerts', () => {
    expect(
      decideSentryRelay({
        kind: 'metric_alert',
        action: 'warning',
        rule: 'r',
        environment: null,
        description: null,
        url: null,
      }),
    ).toEqual({ relay: true })
    expect(decideSentryRelay(parseSentryAlert('event_alert', integrationEvent)!)).toEqual({
      relay: true,
    })
  })

  it('drops a laptop or preview event alert, because the project is shared', () => {
    for (const environment of ['local', 'preview', 'development', null]) {
      const decision = decideSentryRelay({
        kind: 'event_alert',
        rule: 'r',
        title: 't',
        level: 'error',
        environment,
        release: null,
        url: null,
      })
      expect(decision.relay).toBe(false)
    }
  })

  it('never relays issue lifecycle or the installation handshake', () => {
    expect(decideSentryRelay({ kind: 'issue', action: 'created', title: 't' }).relay).toBe(false)
    expect(decideSentryRelay({ kind: 'installation', action: 'created' }).relay).toBe(false)
  })
})

describe('formatSentryAlert', () => {
  it('a critical metric alert is urgent, a warning is high, resolved is quiet', () => {
    const base = {
      kind: 'metric_alert' as const,
      rule: 'Error rate spike',
      environment: 'production',
      description: '57 events in the last 60 minutes',
      url: 'https://kenyonexpress.sentry.io/alerts/7/',
    }
    const critical = formatSentryAlert({ ...base, action: 'critical' })
    expect(critical).toMatchObject({
      title: 'KE Sentry CRITICAL: Error rate spike',
      priority: 'urgent',
      tags: ['rotating_light'],
    })
    expect(critical.message).toContain('57 events')
    expect(critical.message).toContain('https://kenyonexpress.sentry.io/alerts/7/')
    expect(formatSentryAlert({ ...base, action: 'warning' })).toMatchObject({
      title: 'KE Sentry warning: Error rate spike',
      priority: 'high',
    })
    expect(formatSentryAlert({ ...base, action: 'resolved' })).toMatchObject({
      title: 'KE Sentry resolved: Error rate spike',
      priority: 'default',
      tags: ['white_check_mark'],
    })
  })

  it('an event alert names the rule in the title, and the release as a short sha', () => {
    const out = formatSentryAlert(parseSentryAlert('event_alert', integrationEvent)!)
    expect(out.title).toBe('KE Sentry: New production issue')
    expect(out.priority).toBe('high')
    expect(out.message.split('\n')).toEqual([
      'TypeError: cannot read properties of undefined',
      'סביבה: production',
      'גרסה: 0123456',
      'קישור: https://kenyonexpress.sentry.io/issues/42/events/e1/',
    ])
  })

  it('a fatal event alert is urgent', () => {
    const alert = parseSentryAlert('event_alert', {
      ...integrationEvent,
      data: {
        ...integrationEvent.data,
        event: { ...integrationEvent.data.event, level: 'fatal' },
      },
    })!
    expect(formatSentryAlert(alert).priority).toBe('urgent')
  })

  it('titles stay ASCII, because ntfy reads the header as ASCII', () => {
    const samples = [
      formatSentryAlert(parseSentryAlert('event_alert', integrationEvent)!),
      formatSentryAlert({ kind: 'issue', action: 'resolved', title: 'x' }),
      formatSentryAlert({ kind: 'installation', action: 'created' }),
    ]
    for (const sample of samples) expect(sample.title).toMatch(/^[\x20-\x7e]+$/)
  })
})
