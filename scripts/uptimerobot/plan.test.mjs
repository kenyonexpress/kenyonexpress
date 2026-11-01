import { describe, expect, it } from 'vitest'
import {
  CONTACT_NAME,
  MIN_INTERVAL_SECONDS,
  MONITOR_NAME,
  contactSpec,
  desiredContact,
  desiredMonitor,
  planChanges,
  webhookUrl,
} from './plan.mjs'

const secret = 'a-secret-long-enough-to-count'
const baseUrl = 'https://kenyonexpress.co.il'

describe('webhookUrl', () => {
  it('points at the relay route with the secret and raw placeholders', () => {
    const url = webhookUrl({ baseUrl, secret })
    expect(url.startsWith('https://kenyonexpress.co.il/api/alerts/uptimerobot?secret=')).toBe(true)
    expect(url).toContain(`secret=${secret}`)
    // UptimeRobot only substitutes the literal *name* form; an encoded
    // asterisk would arrive as the text "%2AalertType%2A".
    expect(url).toContain('&alertType=*alertType*')
    expect(url).toContain('&monitorURL=*monitorURL*')
    expect(url).not.toContain('%2A')
  })

  it('refuses a short secret and a plain-http public origin', () => {
    expect(() => webhookUrl({ baseUrl, secret: 'short' })).toThrow(/20 characters/)
    expect(() => webhookUrl({ baseUrl: 'http://kenyonexpress.co.il', secret })).toThrow(/https/)
  })
})

describe('desiredMonitor', () => {
  it('polls /api/health over GET and floors the interval at the free-plan minimum', () => {
    const monitor = desiredMonitor({ baseUrl, intervalSeconds: 60 })
    expect(monitor).toMatchObject({
      friendly_name: MONITOR_NAME,
      url: 'https://kenyonexpress.co.il/api/health',
      type: 1,
      http_method: 2,
      interval: MIN_INTERVAL_SECONDS,
    })
    expect(desiredMonitor({ baseUrl, intervalSeconds: 600 }).interval).toBe(600)
    expect(desiredMonitor({ baseUrl, intervalSeconds: 'nope' }).interval).toBe(MIN_INTERVAL_SECONDS)
  })
})

describe('planChanges', () => {
  const monitor = desiredMonitor({ baseUrl })
  const contact = desiredContact({ baseUrl, secret })

  it('creates both on an empty account', () => {
    expect(planChanges({ monitors: [], contacts: [], monitor, contact })).toEqual({
      contact: { action: 'create' },
      monitor: { action: 'create' },
    })
  })

  it('keeps what already matches', () => {
    const plan = planChanges({
      monitors: [{ id: 7, friendly_name: MONITOR_NAME, url: monitor.url, interval: 300 }],
      contacts: [{ id: 3, friendly_name: CONTACT_NAME, value: contact.value }],
      monitor,
      contact,
    })
    expect(plan).toEqual({ contact: { action: 'keep', id: 3 }, monitor: { action: 'keep', id: 7 } })
  })

  it('updates only the fields that drifted, and a rotated secret updates the contact', () => {
    const plan = planChanges({
      monitors: [{ id: 7, friendly_name: MONITOR_NAME, url: monitor.url, interval: 900 }],
      contacts: [{ id: 3, friendly_name: CONTACT_NAME, value: 'https://old' }],
      monitor,
      contact,
    })
    expect(plan.monitor).toEqual({ action: 'update', id: 7, changes: { interval: 300 } })
    expect(plan.contact).toEqual({ action: 'update', id: 3, changes: { value: contact.value } })
  })

  it('formats the contact spec as alert-once', () => {
    expect(contactSpec(3)).toBe('3_0_0')
  })
})
