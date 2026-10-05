import { CLUB_TIERS } from '@/lib/club/tiers'
import { agorot } from '@/lib/money'
import { describe, expect, it } from 'vitest'
import {
  CLUB_THRESHOLD_MAX_AGOROT,
  EDITABLE_CLUB_TIERS,
  parseClubTiersForm,
  pickThresholds,
  thresholdInputs,
  thresholdsToRows,
} from './club-tiers-settings'

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe('club tier thresholds form', () => {
  it('edits the three paid tiers and never the floor', () => {
    expect(EDITABLE_CLUB_TIERS).toEqual(['silver', 'gold', 'platinum'])
  })

  it('reads shekel text, with thousands separators, into integer agorot', () => {
    const parsed = parseClubTiersForm(
      form({ silver: '1,000', gold: '3000.50', platinum: '10,000.00' }),
    )
    expect(parsed).toEqual({
      ok: true,
      value: { silver: 100_000, gold: 300_050, platinum: 1_000_000 },
    })
  })

  it('round-trips the compiled defaults through the inputs', () => {
    const inputs = thresholdInputs(CLUB_TIERS)
    expect(inputs).toEqual({ silver: '1000.00', gold: '3000.00', platinum: '10000.00' })
    const parsed = parseClubTiersForm(form(inputs))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(thresholdsToRows(parsed.value)).toEqual([
        { id: 'silver', rank: 1, min_agorot: 100_000 },
        { id: 'gold', rank: 2, min_agorot: 300_000 },
        { id: 'platinum', rank: 3, min_agorot: 1_000_000 },
      ])
    }
  })

  it.each([
    ['an empty field', { silver: '', gold: '3000', platinum: '10000' }, 'שדה חובה'],
    ['three decimals', { silver: '1000.555', gold: '3000', platinum: '10000' }, 'סכום לא תקין'],
    ['words', { silver: 'אלף', gold: '3000', platinum: '10000' }, 'סכום לא תקין'],
    ['a zero paid tier', { silver: '0', gold: '3000', platinum: '10000' }, 'מעל ₪0'],
    ['gold at silver', { silver: '3000', gold: '3000', platinum: '10000' }, 'הזהב'],
    ['gold below silver', { silver: '5000', gold: '3000', platinum: '10000' }, 'הזהב'],
    ['platinum below gold', { silver: '1000', gold: '3000', platinum: '2999.99' }, 'הפלטינה'],
    [
      'above the ceiling',
      { silver: '1000', gold: '3000', platinum: String(CLUB_THRESHOLD_MAX_AGOROT / 100 + 1) },
      '1,000,000',
    ],
  ])('refuses %s with a readable message', (_label, values, fragment) => {
    const parsed = parseClubTiersForm(form(values))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain(fragment)
  })

  it('never lets a float reach the row', () => {
    const parsed = parseClubTiersForm(
      form({ silver: '1000.10', gold: '3000.20', platinum: '10000.30' }),
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      for (const row of thresholdsToRows(parsed.value)) {
        expect(Number.isSafeInteger(row.min_agorot)).toBe(true)
      }
      expect(parsed.value.silver).toBe(100_010)
    }
  })

  it('picks the audit shape from valid rows, and from raw rows when they do not validate', () => {
    expect(pickThresholds(null)).toBeNull()
    expect(
      pickThresholds([
        { id: 'platinum', min_agorot: 1_000_000 },
        { id: 'member', min_agorot: 0 },
        { id: 'gold', min_agorot: 300_000 },
        { id: 'silver', min_agorot: '100000' },
      ]),
    ).toEqual({ member: 0, silver: 100_000, gold: 300_000, platinum: 1_000_000 })
    // Half a table: the before-image is still what was there.
    expect(pickThresholds([{ id: 'silver', min_agorot: 5 }])).toEqual({ silver: 5 })
    expect(thresholdInputs([{ id: 'member', minAgorot: agorot(0) }])).toEqual({
      silver: '0.00',
      gold: '0.00',
      platinum: '0.00',
    })
  })
})
