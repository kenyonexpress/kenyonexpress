import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MIN_BUSINESS_DAYS,
  DELIVERY_SLOT_MAX_DAYS_AHEAD,
  DELIVERY_SLOT_SPAN_DAYS,
  DELIVERY_WINDOWS,
  addDays,
  daysBetween,
  deliverySlotLabel,
  deliverySlotNoteLine,
  encodeDeliverySlot,
  formatIsraeliDate,
  isCalendarDate,
  isDeliveryDay,
  jerusalemDate,
  listDeliverySlots,
  parseDeliverySlot,
  validateDeliverySlot,
  weekdayOf,
} from './delivery-slots'

/** 2026-10-01 is a Thursday. 22:30 UTC is 01:30 on the 2nd in Israel (UTC+3 until 25.10). */
const THURSDAY_LATE_UTC = new Date('2026-10-01T22:30:00Z')
/** Same day, at noon UTC, when both zones agree it is the 1st. */
const THURSDAY_NOON_UTC = new Date('2026-10-01T12:00:00Z')

describe('jerusalemDate', () => {
  it('is the Israeli calendar date, not the UTC one', () => {
    expect(jerusalemDate(THURSDAY_NOON_UTC)).toBe('2026-10-01')
    // At 22:30 UTC the server's date is still the 1st; in Israel the 2nd began
    // ninety minutes ago. A slot list keyed on the UTC date would offer
    // "tomorrow" as a day that is already today.
    expect(jerusalemDate(THURSDAY_LATE_UTC)).toBe('2026-10-02')
  })

  it('follows the winter clock too', () => {
    // 2026-12-15 21:30 UTC is 23:30 in Israel (UTC+2): still the 15th.
    expect(jerusalemDate(new Date('2026-12-15T21:30:00Z'))).toBe('2026-12-15')
    expect(jerusalemDate(new Date('2026-12-15T22:30:00Z'))).toBe('2026-12-16')
  })
})

describe('calendar arithmetic on plain dates', () => {
  it('knows the weekday from the date alone', () => {
    expect(weekdayOf('2026-10-01')).toBe(4) // Thursday
    expect(weekdayOf('2026-10-02')).toBe(5) // Friday
    expect(weekdayOf('2026-10-03')).toBe(6) // Saturday
    expect(weekdayOf('2026-10-04')).toBe(0) // Sunday
  })

  it('delivers Sunday to Thursday and not Friday or Saturday', () => {
    expect(isDeliveryDay('2026-10-04')).toBe(true)
    expect(isDeliveryDay('2026-10-08')).toBe(true)
    expect(isDeliveryDay('2026-10-02')).toBe(false)
    expect(isDeliveryDay('2026-10-03')).toBe(false)
  })

  it('adds days across a month end and counts the distance back', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3)
  })

  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('2026-2-3')).toBe(false)
    expect(isCalendarDate('2028-02-29')).toBe(true)
  })

  it('formats the Israeli way, day first and unpadded', () => {
    expect(formatIsraeliDate('2026-10-04')).toBe('4.10.2026')
  })
})

describe('slot encoding', () => {
  it('round-trips date|window', () => {
    const value = encodeDeliverySlot('2026-10-04', 'morning')
    expect(value).toBe('2026-10-04|morning')
    expect(parseDeliverySlot(value)).toEqual({ date: '2026-10-04', window: 'morning' })
  })

  it('refuses a malformed value at the shape level', () => {
    expect(parseDeliverySlot('')).toBeNull()
    expect(parseDeliverySlot(null)).toBeNull()
    expect(parseDeliverySlot('2026-10-04')).toBeNull()
    expect(parseDeliverySlot('2026-10-04|evening')).toBeNull()
    expect(parseDeliverySlot('2026-10-04|morning|x')).toBeNull()
    expect(parseDeliverySlot('tomorrow|morning')).toBeNull()
  })

  it('labels a slot in Hebrew with the weekday, the date and the hours', () => {
    expect(deliverySlotLabel('2026-10-04', 'morning')).toBe(
      'יום ראשון, 4.10.2026, בוקר (09:00-13:00)',
    )
    expect(deliverySlotLabel('2026-10-08', 'afternoon')).toBe(
      'יום חמישי, 8.10.2026, אחר הצהריים (13:00-17:00)',
    )
    expect(deliverySlotNoteLine('יום ראשון, 4.10.2026, בוקר (09:00-13:00)')).toBe(
      'מועד מסירה מועדף: יום ראשון, 4.10.2026, בוקר (09:00-13:00)',
    )
  })
})

describe('listDeliverySlots', () => {
  it('starts on the next delivery day after today and skips the weekend', () => {
    // Today is Thursday the 1st in Israel; Friday and Saturday are not offered,
    // so the first slot is Sunday the 4th at offset 1.
    const slots = listDeliverySlots({ now: THURSDAY_NOON_UTC })
    expect(slots[0]?.date).toBe('2026-10-04')
    expect(slots[0]?.offset).toBe(1)
    expect(slots.every((slot) => isDeliveryDay(slot.date))).toBe(true)
  })

  it('offers both windows for every day, in the window order', () => {
    const slots = listDeliverySlots({ now: THURSDAY_NOON_UTC })
    const byDate = new Map<string, string[]>()
    for (const slot of slots) byDate.set(slot.date, [...(byDate.get(slot.date) ?? []), slot.window])
    for (const windows of byDate.values()) {
      expect(windows).toEqual(DELIVERY_WINDOWS.map((window) => window.id))
    }
  })

  it('numbers business days, not calendar days, so a city minimum can filter on it', () => {
    const slots = listDeliverySlots({ now: THURSDAY_NOON_UTC })
    const offsets = [...new Set(slots.map((slot) => slot.offset))]
    expect(offsets).toEqual(offsets.map((_, index) => index + 1))
    // Offset 5 is the following Thursday, not the Tuesday five calendar days on.
    expect(slots.find((slot) => slot.offset === 5)?.date).toBe('2026-10-08')
  })

  it('reaches far enough past the default minimum to give a real choice', () => {
    const slots = listDeliverySlots({ now: THURSDAY_NOON_UTC })
    const maxOffset = Math.max(...slots.map((slot) => slot.offset))
    expect(maxOffset).toBe(DEFAULT_MIN_BUSINESS_DAYS + DELIVERY_SLOT_SPAN_DAYS)
    expect(slots.filter((slot) => slot.offset >= DEFAULT_MIN_BUSINESS_DAYS).length).toBe(
      (DELIVERY_SLOT_SPAN_DAYS + 1) * DELIVERY_WINDOWS.length,
    )
  })

  it('uses the Israeli date for "today"', () => {
    // 22:30 UTC on Thursday is already Friday in Israel: tomorrow is Saturday,
    // so the first slot is still Sunday, but the walk started a day later and
    // that shows in the same first date with the same offset.
    const slots = listDeliverySlots({ now: THURSDAY_LATE_UTC })
    expect(slots[0]?.date).toBe('2026-10-04')
    // From Sunday noon Israel time, tomorrow is Monday.
    const fromSunday = listDeliverySlots({ now: new Date('2026-10-04T09:00:00Z') })
    expect(fromSunday[0]?.date).toBe('2026-10-05')
  })

  it('never offers a slot the validator would refuse', () => {
    for (const now of [THURSDAY_NOON_UTC, THURSDAY_LATE_UTC, new Date('2026-10-04T09:00:00Z')]) {
      for (const slot of listDeliverySlots({ now })) {
        expect(validateDeliverySlot(slot.value, { now }).ok, slot.value).toBe(true)
      }
    }
  })

  it('stays inside the 30-day window whatever span is asked for', () => {
    const slots = listDeliverySlots({ now: THURSDAY_NOON_UTC, spanDays: 500, maxOffset: 500 })
    const last = slots.at(-1)
    expect(last).toBeDefined()
    if (last)
      expect(daysBetween('2026-10-01', last.date)).toBeLessThanOrEqual(DELIVERY_SLOT_MAX_DAYS_AHEAD)
  })
})

describe('validateDeliverySlot', () => {
  const now = THURSDAY_NOON_UTC

  it('accepts a delivery day from tomorrow within the month', () => {
    const result = validateDeliverySlot('2026-10-04|afternoon', { now })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.date).toBe('2026-10-04')
      expect(result.window).toBe('afternoon')
      expect(result.label).toContain('4.10.2026')
    }
  })

  it('refuses today and the past', () => {
    expect(validateDeliverySlot('2026-10-01|morning', { now }).ok).toBe(false)
    expect(validateDeliverySlot('2026-09-28|morning', { now }).ok).toBe(false)
  })

  it('refuses Friday and Saturday by name', () => {
    const friday = validateDeliverySlot('2026-10-02|morning', { now })
    expect(friday.ok).toBe(false)
    if (!friday.ok) expect(friday.message).toContain('ראשון עד חמישי')
    expect(validateDeliverySlot('2026-10-03|morning', { now }).ok).toBe(false)
  })

  it('refuses a date beyond the window, and accepts the edge', () => {
    // 31 days out is Sunday the 1st of November: a delivery day, too far.
    expect(validateDeliverySlot('2026-11-01|morning', { now }).ok).toBe(false)
    // 29 days out is Friday; 27 days out is Wednesday the 28th: inside.
    expect(validateDeliverySlot('2026-10-28|morning', { now }).ok).toBe(true)
  })

  it('refuses a malformed value with the generic message', () => {
    const result = validateDeliverySlot('soon', { now })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('מועד המסירה שנבחר אינו תקין')
  })

  it('is tolerant across midnight: a slot picked yesterday evening is still fine after it', () => {
    // Picked from the list at Thursday noon (first slot Sunday the 4th) and
    // submitted at 01:30 Friday Israel time: still tomorrow-or-later.
    const picked = listDeliverySlots({ now: THURSDAY_NOON_UTC })[0]
    expect(picked).toBeDefined()
    if (picked) expect(validateDeliverySlot(picked.value, { now: THURSDAY_LATE_UTC }).ok).toBe(true)
  })
})
