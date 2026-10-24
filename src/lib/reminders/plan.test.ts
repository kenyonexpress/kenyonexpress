import { describe, expect, it } from 'vitest'
import {
  channelsFor,
  dueOffset,
  expiryFrom,
  planReminder,
  resolveValidityDays,
  waReminderLink,
} from './plan'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-23T09:00:00Z')

describe('resolveValidityDays', () => {
  it('defaults to 90 and accepts only 30/60/90', () => {
    expect(resolveValidityDays(null)).toBe(90)
    expect(resolveValidityDays(undefined)).toBe(90)
    expect(resolveValidityDays(45)).toBe(90)
    expect(resolveValidityDays(30)).toBe(30)
    expect(resolveValidityDays(60)).toBe(60)
    expect(resolveValidityDays(90)).toBe(90)
  })
  it('computes expiry', () => {
    expect(expiryFrom(now, 30).getTime()).toBe(now.getTime() + 30 * DAY)
  })
})

describe('dueOffset', () => {
  it('maps windows to T-7 and T-1', () => {
    expect(dueOffset(new Date(now.getTime() + 10 * DAY), now)).toBeNull()
    expect(dueOffset(new Date(now.getTime() + 7 * DAY), now)).toBe(7)
    expect(dueOffset(new Date(now.getTime() + 3 * DAY), now)).toBe(7)
    expect(dueOffset(new Date(now.getTime() + DAY), now)).toBe(1)
    expect(dueOffset(new Date(now.getTime() + 1000), now)).toBe(1)
    expect(dueOffset(new Date(now.getTime() - 1), now)).toBeNull()
  })
})

describe('planReminder', () => {
  const base = {
    id: 'v1',
    userId: 'u1',
    email: 'a@b.co',
    code: 'ABC',
    supplierName: 'S',
    expiresAt: new Date(now.getTime() + 2 * DAY),
    alreadySent: [] as (7 | 1)[],
  }
  it('builds a deduped voucher_expiring row', () => {
    const row = planReminder(base, now)
    expect(row?.kind).toBe('voucher_expiring')
    expect(row?.dedupe_key).toBe('voucher_expiring:v1:T7')
  })
  it('is a no-op once that offset was sent', () => {
    expect(planReminder({ ...base, alreadySent: [7] }, now)).toBeNull()
  })
})

describe('channels', () => {
  it('push and email always, WhatsApp link only on opt-in', () => {
    expect(channelsFor({ whatsappOptIn: false })).toEqual({
      push: true,
      email: true,
      whatsappLink: false,
    })
    expect(channelsFor({ whatsappOptIn: true }).whatsappLink).toBe(true)
  })
  it('never yields a wa.me link without opt-in', () => {
    expect(waReminderLink({ whatsappOptIn: false }, '0524635550', 'x')).toBeNull()
    expect(waReminderLink({ whatsappOptIn: true }, '0524635550', 'x')).toContain('wa.me')
  })
})
