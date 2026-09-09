import type { IsoDate } from '@/lib/cabins/nights'

/**
 * The availability calendar as iCalendar, for a supplier who runs their own
 * bookings elsewhere.
 *
 * =========================================================================
 * IT PUBLISHES DATES AND NOTHING ELSE
 * =========================================================================
 *
 * An iCal URL is a bearer token in a query string: it gets pasted into Google
 * Calendar, forwarded, and sometimes indexed. So the feed carries the unit, the
 * dates, and the word "booked" - no guest name, no price, no guest count, no
 * order id. That is what an availability feed is FOR, and everything else in
 * the row is what it would leak.
 *
 * =========================================================================
 * THE LINE ENDINGS AND THE FOLDING ARE THE SPEC, NOT A STYLE
 * =========================================================================
 *
 * RFC 5545 requires CRLF between lines, and readers do reject LF-only feeds -
 * Google Calendar among them. Lines over 75 octets must be folded with a CRLF
 * and a leading space. Both are the kind of thing that works in every test
 * anybody writes by hand and fails on the one calendar that matters.
 *
 * DTEND IS EXCLUSIVE for a `VALUE=DATE` event, which is the same half-open
 * convention `daterange` uses. So a stay stored as `[01, 05)` is published as
 * DTSTART 01, DTEND 05 with no arithmetic at all - and the checkout morning is
 * free in the guest's calendar exactly as it is in ours.
 */

export interface IcalBooking {
  /** Stable per booking, so a re-fetch updates rather than duplicates. */
  uid: string
  checkIn: IsoDate
  /** Exclusive, as stored. */
  checkOut: IsoDate
  /** `held` bookings are published as TENTATIVE so a supplier can tell. */
  status: 'held' | 'confirmed'
}

const CRLF = '\r\n'

/** `2026-10-01` to `20261001`. iCal dates carry no separators. */
function icalDate(date: IsoDate): string {
  return date.replaceAll('-', '')
}

/** A UTC timestamp, for DTSTAMP. */
function icalStamp(at: Date): string {
  return `${at.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

/**
 * Escape the characters RFC 5545 reserves inside a text value.
 *
 * Backslash FIRST, or the escapes escape each other - the same ordering trap
 * `sitemap-sections.ts` records for XML entities.
 */
function icalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, ';')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** RFC 5545 line folding: 75 octets, continued with CRLF and one space. */
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line

  const out: string[] = []
  let current = ''
  for (const char of line) {
    const candidate = current + char
    // 74 rather than 75 on continuation lines, because the leading space counts.
    const limit = out.length === 0 ? 75 : 74
    if (Buffer.byteLength(candidate, 'utf8') > limit) {
      out.push(current)
      current = char
    } else {
      current = candidate
    }
  }
  if (current) out.push(current)
  return out.map((part, index) => (index === 0 ? part : ` ${part}`)).join(CRLF)
}

export function buildAvailabilityIcal(input: {
  unitName: string
  bookings: readonly IcalBooking[]
  now: Date
}): string {
  const stamp = icalStamp(input.now)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KenyonExpress//Cabin availability//HE',
    'CALSCALE:GREGORIAN',
    // PUBLISH, not REQUEST: this is a feed to read, and a supplier's calendar
    // must not treat it as an invitation it can accept or decline.
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalText(input.unitName)}`,
  ]

  for (const booking of input.bookings) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${booking.uid}@kenyonexpress.co.il`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icalDate(booking.checkIn)}`,
      // Exclusive, as stored. No arithmetic, and the checkout morning stays free.
      `DTEND;VALUE=DATE:${icalDate(booking.checkOut)}`,
      // The only text in the feed, and it says nothing about who.
      `SUMMARY:${icalText(booking.status === 'held' ? 'משובץ זמנית' : 'תפוס')}`,
      `STATUS:${booking.status === 'held' ? 'TENTATIVE' : 'CONFIRMED'}`,
      // Free/busy: a blocked night is busy even while it is only held.
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')

  // Trailing CRLF: RFC 5545 ends the last line like every other one, and some
  // parsers drop a final line that has no terminator.
  return `${lines.map(fold).join(CRLF)}${CRLF}`
}
