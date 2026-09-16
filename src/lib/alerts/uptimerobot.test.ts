import { describe, expect, it } from 'vitest'
import { formatDuration, formatUptimeRobotAlert, parseUptimeRobotAlert } from './uptimerobot'

describe('parseUptimeRobotAlert', () => {
  it('reads a down alert', () => {
    expect(
      parseUptimeRobotAlert({
        alertType: '1',
        monitorFriendlyName: 'KenyonExpress /api/health',
        monitorURL: 'https://kenyonexpress.co.il/api/health',
        alertDetails: 'HTTP 503 - Service Unavailable',
        alertDuration: '',
      }),
    ).toEqual({
      kind: 'down',
      monitorName: 'KenyonExpress /api/health',
      monitorUrl: 'https://kenyonexpress.co.il/api/health',
      details: 'HTTP 503 - Service Unavailable',
      durationSeconds: null,
      sslDaysLeft: null,
    })
  })

  it('reads an up alert with its duration, and an ssl alert with its days left', () => {
    expect(parseUptimeRobotAlert({ alertType: '2', alertDuration: '420' })).toMatchObject({
      kind: 'up',
      durationSeconds: 420,
    })
    expect(parseUptimeRobotAlert({ alertType: '3', sslExpiryDaysLeft: '7' })).toMatchObject({
      kind: 'ssl_expiry',
      sslDaysLeft: 7,
    })
  })

  it('refuses an unknown or missing alert type rather than guessing', () => {
    expect(parseUptimeRobotAlert({})).toBeNull()
    expect(parseUptimeRobotAlert({ alertType: '9' })).toBeNull()
    expect(parseUptimeRobotAlert({ alertType: 'down' })).toBeNull()
    expect(parseUptimeRobotAlert({ alertType: ['1'] })).toBeNull()
  })

  it('treats an unfilled placeholder as empty and caps every string', () => {
    const parsed = parseUptimeRobotAlert({
      alertType: '1',
      monitorFriendlyName: '*monitorFriendlyName*',
      alertDetails: 'x'.repeat(1000),
      alertDuration: 'not-a-number',
    })
    expect(parsed?.monitorName).toBe('monitor')
    expect(parsed?.details).toHaveLength(300)
    expect(parsed?.durationSeconds).toBeNull()
  })
})

describe('formatUptimeRobotAlert', () => {
  it('pages urgently on down, with the reason and the URL', () => {
    const out = formatUptimeRobotAlert({
      kind: 'down',
      monitorName: 'KE',
      monitorUrl: 'https://kenyonexpress.co.il/api/health',
      details: 'HTTP 503',
      durationSeconds: null,
      sslDaysLeft: null,
    })
    expect(out.priority).toBe('urgent')
    expect(out.title).toBe('KE DOWN: KE')
    expect(out.title).toMatch(/^[\x20-\x7e]+$/)
    expect(out.message).toContain('https://kenyonexpress.co.il/api/health')
    expect(out.message).toContain('HTTP 503')
  })

  it('is quiet on recovery and says how long it lasted', () => {
    const out = formatUptimeRobotAlert({
      kind: 'up',
      monitorName: 'KE',
      monitorUrl: '',
      details: '',
      durationSeconds: 3900,
      sslDaysLeft: null,
    })
    expect(out.priority).toBe('default')
    expect(out.message).toContain('שעות ו-5 דקות')
    expect(out.message).not.toContain('כתובת')
  })

  it('warns, without paging, on certificate expiry', () => {
    const out = formatUptimeRobotAlert({
      kind: 'ssl_expiry',
      monitorName: 'KE',
      monitorUrl: '',
      details: '',
      durationSeconds: null,
      sslDaysLeft: 7,
    })
    expect(out.priority).toBe('high')
    expect(out.message).toContain('נותרו 7 ימים')
  })
})

describe('formatDuration', () => {
  it('picks the coarsest unit that is honest', () => {
    expect(formatDuration(30)).toBe('30 שניות')
    expect(formatDuration(600)).toBe('10 דקות')
    expect(formatDuration(7200)).toBe('2 שעות')
    expect(formatDuration(5400)).toBe('1 שעות ו-30 דקות')
  })
})
