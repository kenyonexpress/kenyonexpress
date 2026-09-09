import { buildAvailabilityIcal } from '@/lib/cabins/ical'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-09-09T12:00:00.000Z')

const feed = (bookings: Parameters<typeof buildAvailabilityIcal>[0]['bookings']) =>
  buildAvailabilityIcal({ unitName: 'צימר הגליל', bookings, now: NOW })

describe('buildAvailabilityIcal', () => {
  it('uses CRLF everywhere, which readers reject feeds without', () => {
    const out = feed([])
    expect(out).toContain('\r\n')
    // No bare LF anywhere: every LF must be preceded by a CR.
    expect(/[^\r]\n/.test(out)).toBe(false)
    expect(out.endsWith('\r\n')).toBe(true)
  })

  it('publishes DTEND exclusive, so the checkout morning stays free', () => {
    // The same half-open convention `daterange` uses, so a stay stored as
    // [01, 05) needs no arithmetic at all.
    const out = feed([
      { uid: 'b1', checkIn: '2026-10-01', checkOut: '2026-10-05', status: 'confirmed' },
    ])
    expect(out).toContain('DTSTART;VALUE=DATE:20261001')
    expect(out).toContain('DTEND;VALUE=DATE:20261005')
  })

  it('marks a hold TENTATIVE and a booking CONFIRMED', () => {
    const out = feed([
      { uid: 'b1', checkIn: '2026-10-01', checkOut: '2026-10-02', status: 'held' },
      { uid: 'b2', checkIn: '2026-10-03', checkOut: '2026-10-04', status: 'confirmed' },
    ])
    expect(out).toContain('STATUS:TENTATIVE')
    expect(out).toContain('STATUS:CONFIRMED')
  })

  it('leaks nothing about who booked it', () => {
    // An iCal URL is a bearer token in a query string: it gets pasted into
    // Google Calendar, forwarded, and sometimes indexed.
    const out = feed([
      { uid: 'b1', checkIn: '2026-10-01', checkOut: '2026-10-05', status: 'confirmed' },
    ])
    // The only `@` in the feed is the UID's own domain suffix. Anything else
    // would be an address, which is the leak this feed is most likely to carry.
    const ats = out.match(/@[^\r\n]*/g) ?? []
    expect(ats).toEqual(['@kenyonexpress.co.il'])
    expect(out).not.toContain('₪')
    expect(out.toLowerCase()).not.toContain('guest')
    expect(out).not.toMatch(/\bagorot\b/i)
    // And no money at all: four or more consecutive digits would be a price in
    // agorot, and the only long digit runs here are dates.
    expect(out).not.toMatch(/total|price|amount/i)
  })

  it('escapes the characters RFC 5545 reserves', () => {
    const out = buildAvailabilityIcal({
      unitName: 'צימר; הגליל, "יפה"\\',
      bookings: [],
      now: NOW,
    })
    expect(out).toContain(';')
    expect(out).toContain('\\,')
    expect(out).toContain('\\\\')
  })

  it('folds long lines at 75 octets with a leading space', () => {
    const out = buildAvailabilityIcal({
      unitName: 'א'.repeat(200),
      bookings: [],
      now: NOW,
    })
    for (const line of out.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
    expect(out).toContain('\r\n ')
  })

  it('is a complete calendar even with no bookings', () => {
    const out = feed([])
    expect(out).toContain('BEGIN:VCALENDAR')
    expect(out).toContain('END:VCALENDAR')
    expect(out).toContain('METHOD:PUBLISH')
    expect(out).not.toContain('BEGIN:VEVENT')
  })
})
