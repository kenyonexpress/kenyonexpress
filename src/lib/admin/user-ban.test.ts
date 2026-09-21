import { describe, expect, it } from 'vitest'
import { authorizeBan, isBanned, readBanReason } from './user-ban'

describe('authorizeBan', () => {
  const me = '00000000-0000-4000-8000-0000000000aa'
  const other = '00000000-0000-4000-8000-0000000000bb'

  it('never lets a caller ban themself', () => {
    expect(
      authorizeBan({
        callerId: me,
        callerRole: 'super_admin',
        targetUserId: me,
        targetRole: 'customer',
      }),
    ).toEqual({
      ok: false,
      error: 'אי אפשר לחסום את עצמך',
    })
  })

  it('reserves banning an admin to super_admin', () => {
    expect(
      authorizeBan({ callerId: me, callerRole: 'admin', targetUserId: other, targetRole: 'admin' })
        .ok,
    ).toBe(false)
    expect(
      authorizeBan({
        callerId: me,
        callerRole: 'super_admin',
        targetUserId: other,
        targetRole: 'admin',
      }).ok,
    ).toBe(true)
    expect(
      authorizeBan({
        callerId: me,
        callerRole: 'admin',
        targetUserId: other,
        targetRole: 'customer',
      }).ok,
    ).toBe(true)
    expect(
      authorizeBan({ callerId: me, callerRole: 'admin', targetUserId: other, targetRole: null }).ok,
    ).toBe(true)
  })
})

describe('isBanned', () => {
  const now = new Date('2026-09-22T12:00:00Z')
  it('is true only for a future banned_until', () => {
    expect(isBanned(null, now)).toBe(false)
    expect(isBanned('2026-09-22T11:59:59Z', now)).toBe(false)
    expect(isBanned('2126-09-22T12:00:00Z', now)).toBe(true)
    expect(isBanned('not a date', now)).toBe(false)
  })
})

describe('readBanReason', () => {
  it('requires five characters and caps at 300', () => {
    expect(readBanReason('קצר')).toBeNull()
    expect(readBanReason('  הונאה מוכחת בכרטיס גנוב  ')).toBe('הונאה מוכחת בכרטיס גנוב')
    expect(readBanReason('א'.repeat(400))?.length).toBe(300)
    expect(readBanReason(undefined)).toBeNull()
  })
})
