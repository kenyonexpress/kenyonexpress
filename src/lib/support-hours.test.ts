import { describe, expect, it } from 'vitest'
import {
  HEBREW_WEEKDAYS,
  SUPPORT_HOURS_ROWS,
  SUPPORT_WEEK,
  formatMinutes,
  jerusalemClock,
  supportOpeningHoursSpecification,
  supportStatus,
  supportStatusLabel,
} from './support-hours'

/**
 * Instants are written in UTC and the expectation is the Israeli wall clock.
 * January is UTC+2 (winter) and July is UTC+3 (summer); 2026-01-11 and
 * 2026-07-05 are Sundays, 2026-07-10 is a Friday.
 */
const at = (iso: string) => new Date(iso)

describe('jerusalemClock', () => {
  it('reads the Israeli wall clock in winter (UTC+2)', () => {
    expect(jerusalemClock(at('2026-01-11T07:00:00Z'))).toEqual({ weekday: 0, minutes: 9 * 60 })
  })

  it('reads the Israeli wall clock in summer (UTC+3)', () => {
    expect(jerusalemClock(at('2026-07-10T06:30:00Z'))).toEqual({
      weekday: 5,
      minutes: 9 * 60 + 30,
    })
  })

  it('rolls the weekday at Israeli midnight, not at UTC midnight', () => {
    // 22:30Z on Sunday is 00:30 on Monday in Israel.
    expect(jerusalemClock(at('2026-01-11T22:30:00Z'))).toEqual({ weekday: 1, minutes: 30 })
  })

  it('prints midnight as 00, never 24', () => {
    expect(jerusalemClock(at('2026-01-11T22:00:00Z')).minutes).toBe(0)
  })
})

describe('supportStatus', () => {
  it('is open on a weekday inside the hours and says when it closes', () => {
    expect(supportStatus(at('2026-01-11T07:00:00Z'))).toEqual({ open: true, closesAt: '18:00' })
    expect(supportStatus(at('2026-01-11T15:59:00Z'))).toEqual({ open: true, closesAt: '18:00' })
  })

  it('is closed before opening and opens later today', () => {
    expect(supportStatus(at('2026-01-11T06:59:00Z'))).toEqual({
      open: false,
      opensInDays: 0,
      opensWeekday: 0,
      opensAt: '09:00',
    })
  })

  it('is closed at the closing minute and opens tomorrow', () => {
    expect(supportStatus(at('2026-01-11T16:00:00Z'))).toEqual({
      open: false,
      opensInDays: 1,
      opensWeekday: 1,
      opensAt: '09:00',
    })
  })

  it('closes early on Friday and reopens on Sunday', () => {
    expect(supportStatus(at('2026-07-10T09:59:00Z'))).toEqual({ open: true, closesAt: '13:00' })
    expect(supportStatus(at('2026-07-10T10:00:00Z'))).toEqual({
      open: false,
      opensInDays: 2,
      opensWeekday: 0,
      opensAt: '09:00',
    })
  })

  it('is closed all of Saturday and opens tomorrow', () => {
    expect(supportStatus(at('2026-07-11T09:00:00Z'))).toEqual({
      open: false,
      opensInDays: 1,
      opensWeekday: 0,
      opensAt: '09:00',
    })
  })

  it('answers for Israel even when UTC is still the previous day', () => {
    // 22:30Z Sunday = 00:30 Monday in Israel: closed, opens later the same day.
    expect(supportStatus(at('2026-01-11T22:30:00Z'))).toEqual({
      open: false,
      opensInDays: 0,
      opensWeekday: 1,
      opensAt: '09:00',
    })
  })
})

describe('supportStatusLabel', () => {
  it('writes each case in Hebrew with the time', () => {
    expect(supportStatusLabel({ open: true, closesAt: '18:00' })).toBe('פתוח עכשיו, עונים עד 18:00')
    expect(
      supportStatusLabel({ open: false, opensInDays: 0, opensWeekday: 2, opensAt: '09:00' }),
    ).toBe('סגור עכשיו, נפתח היום ב-09:00')
    expect(
      supportStatusLabel({ open: false, opensInDays: 1, opensWeekday: 2, opensAt: '09:00' }),
    ).toBe('סגור עכשיו, נפתח מחר ב-09:00')
    expect(
      supportStatusLabel({ open: false, opensInDays: 2, opensWeekday: 0, opensAt: '09:00' }),
    ).toBe(`סגור עכשיו, נפתח ביום ${HEBREW_WEEKDAYS[0]} ב-09:00`)
  })
})

describe('the printed rows describe the same week the badge computes from', () => {
  it('covers every weekday exactly once', () => {
    const covered = SUPPORT_HOURS_ROWS.flatMap((r) => r.weekdays).sort()
    expect(covered).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  for (const row of SUPPORT_HOURS_ROWS) {
    it(`"${row.label}" prints the hours of the days it names`, () => {
      for (const weekday of row.weekdays) {
        const day = SUPPORT_WEEK[weekday]
        if (!day || day.opens === null || day.closes === null) {
          expect(row.hours).toBe('סגור')
        } else {
          expect(row.hours).toBe(`${formatMinutes(day.opens)} עד ${formatMinutes(day.closes)}`)
        }
      }
    })
  }
})

describe('supportOpeningHoursSpecification', () => {
  it('lists each open day and omits the closed one', () => {
    const spec = supportOpeningHoursSpecification()
    expect(spec).toHaveLength(6)
    expect(spec.map((s) => s.dayOfWeek)).not.toContain('Saturday')
    expect(spec.find((s) => s.dayOfWeek === 'Friday')).toEqual({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Friday',
      opens: '09:00',
      closes: '13:00',
    })
  })
})
