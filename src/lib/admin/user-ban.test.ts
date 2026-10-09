import { describe, expect, it } from 'vitest'
import {
  BAN_DURATION_INDEFINITE,
  BAN_DURATION_NONE,
  BAN_REASON_MAX,
  authorizeBan,
  isBanned,
  normalizeBanReason,
} from './user-ban'

const ME = '11111111-1111-4111-8111-111111111111'
const THEM = '22222222-2222-4222-8222-222222222222'

describe('authorizeBan', () => {
  it('lets an admin ban and unban a customer', () => {
    for (const action of ['ban', 'unban'] as const) {
      expect(
        authorizeBan({
          callerId: ME,
          callerRole: 'admin',
          targetUserId: THEM,
          targetRole: 'customer',
          action,
        }),
      ).toEqual({ ok: true })
    }
  })

  it('refuses every non-admin caller, including the panel read tiers', () => {
    for (const role of [
      'support',
      'read_only',
      'content_uploader',
      'vendor',
      'customer',
    ] as const) {
      const result = authorizeBan({
        callerId: ME,
        callerRole: role,
        targetUserId: THEM,
        targetRole: 'customer',
        action: 'ban',
      })
      expect(result.ok).toBe(false)
    }
    expect(
      authorizeBan({
        callerId: ME,
        callerRole: null,
        targetUserId: THEM,
        targetRole: 'customer',
        action: 'ban',
      }).ok,
    ).toBe(false)
  })

  it('never lets a caller ban themselves, whatever their tier', () => {
    for (const role of ['admin', 'super_admin'] as const) {
      const result = authorizeBan({
        callerId: ME,
        callerRole: role,
        targetUserId: ME,
        targetRole: role,
        action: 'ban',
      })
      expect(result).toEqual({ ok: false, error: 'אי אפשר לחסום את עצמך' })
    }
  })

  it('reserves admin-tier targets for super_admin, both directions', () => {
    for (const targetRole of ['admin', 'super_admin'] as const) {
      expect(
        authorizeBan({
          callerId: ME,
          callerRole: 'admin',
          targetUserId: THEM,
          targetRole,
          action: 'ban',
        }).ok,
      ).toBe(false)
      expect(
        authorizeBan({
          callerId: ME,
          callerRole: 'admin',
          targetUserId: THEM,
          targetRole,
          action: 'unban',
        }).ok,
      ).toBe(false)
      expect(
        authorizeBan({
          callerId: ME,
          callerRole: 'super_admin',
          targetUserId: THEM,
          targetRole,
          action: 'ban',
        }),
      ).toEqual({ ok: true })
    }
  })
})

describe('the record helpers', () => {
  it('reads banned from banned_at alone', () => {
    expect(isBanned(null)).toBe(false)
    expect(isBanned({ banned_at: null })).toBe(false)
    expect(isBanned({ banned_at: '2026-09-17T00:00:00Z' })).toBe(true)
  })

  it('normalises the reason to NULL-or-text and caps it', () => {
    expect(normalizeBanReason(undefined)).toBeNull()
    expect(normalizeBanReason('   ')).toBeNull()
    expect(normalizeBanReason('  הונאה בכרטיס  ')).toBe('הונאה בכרטיס')
    expect(normalizeBanReason('א'.repeat(BAN_REASON_MAX + 40))).toHaveLength(BAN_REASON_MAX)
  })

  it('speaks the Auth admin API duration syntax', () => {
    // Go duration: digits followed by a unit GoTrue parses (h is the largest).
    expect(BAN_DURATION_INDEFINITE).toMatch(/^\d+h$/)
    expect(BAN_DURATION_NONE).toBe('none')
  })
})
