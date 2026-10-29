import { beforeEach, describe, expect, it, vi } from 'vitest'

const limit = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ limit }) }) }) }),
    }),
  }),
}))

import { isPartnerPin, normalizePartnerPin, resolvePartnerPin } from './pin'

describe('partner pin', () => {
  beforeEach(() => limit.mockReset())

  it('recognises exactly 8 digits, with separators tolerated', () => {
    expect(isPartnerPin('12345678')).toBe(true)
    expect(isPartnerPin('1234 5678')).toBe(true)
    expect(isPartnerPin('1234-5678')).toBe(true)
    expect(isPartnerPin('1234567')).toBe(false)
    expect(isPartnerPin('123456789')).toBe(false)
    expect(isPartnerPin('ABCDE12345')).toBe(false)
    expect(normalizePartnerPin('1234 5678')).toBe('12345678')
  })

  it('returns null without a query when the caller has no supplier', async () => {
    expect(await resolvePartnerPin('12345678', [])).toBeNull()
    expect(limit).not.toHaveBeenCalled()
  })

  it('resolves a single match to its code', async () => {
    limit.mockResolvedValue({ data: [{ code: 'ABCD123456' }], error: null })
    expect(await resolvePartnerPin('12345678', ['s1'])).toBe('ABCD123456')
  })

  it('treats no match and an ambiguous match alike', async () => {
    limit.mockResolvedValue({ data: [], error: null })
    expect(await resolvePartnerPin('12345678', ['s1'])).toBeNull()
    limit.mockResolvedValue({ data: [{ code: 'A' }, { code: 'B' }], error: null })
    expect(await resolvePartnerPin('12345678', ['s1', 's2'])).toBeNull()
  })

  it('throws on a failed read instead of reporting not-found', async () => {
    limit.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(resolvePartnerPin('12345678', ['s1'])).rejects.toThrow('partner_pin_read_failed')
  })
})
