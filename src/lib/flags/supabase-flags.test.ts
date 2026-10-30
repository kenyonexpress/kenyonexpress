import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetFlagCache, getSupabaseFlags } from './supabase-flags'

describe('getSupabaseFlags', () => {
  beforeEach(() => {
    __resetFlagCache()
  })

  it('reads all flags from Supabase and returns a map', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'physical_products', bool_value: true },
        { key: 'courses_monthly', bool_value: false },
        { key: 'tzimmer_calendar', bool_value: true },
        { key: 'monthly_billing', bool_value: false },
      ],
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result).toEqual({
      'physical-products': true,
      'courses-monthly': false,
      'tzimmer-calendar': true,
      'monthly-billing': false,
      payment_production: false,
      wa_otp_enabled: false,
      card_verify_enabled: false,
    })
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('caches the result for 30 seconds', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'physical_products', bool_value: true },
        { key: 'courses_monthly', bool_value: false },
        { key: 'tzimmer_calendar', bool_value: false },
        { key: 'monthly_billing', bool_value: false },
      ],
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    }
    const t0 = Date.now()

    // First call
    const r1 = await getSupabaseFlags(t0, env as unknown as NodeJS.ProcessEnv, mockFetch as never)
    // Second call within TTL
    const r2 = await getSupabaseFlags(
      t0 + 15_000,
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(r1).toEqual(r2)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('refetches after cache expires', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'physical_products', bool_value: false },
        { key: 'courses_monthly', bool_value: false },
        { key: 'tzimmer_calendar', bool_value: false },
        { key: 'monthly_billing', bool_value: false },
      ],
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    }
    const t0 = Date.now()

    // First call
    await getSupabaseFlags(t0, env as unknown as NodeJS.ProcessEnv, mockFetch as never)
    // Second call after TTL expires
    await getSupabaseFlags(t0 + 31_000, env as unknown as NodeJS.ProcessEnv, mockFetch as never)

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('falls back to env vars when Supabase URL is missing', async () => {
    const mockFetch = vi.fn()
    const env = {
      FLAG_PHYSICAL_PRODUCTS: '1',
      FLAG_COURSES_MONTHLY: 'true',
      FLAG_TZIMMER_CALENDAR: '0',
      FLAG_MONTHLY_BILLING: '',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result).toEqual({
      'physical-products': true,
      'courses-monthly': true,
      'tzimmer-calendar': false,
      'monthly-billing': false,
      payment_production: false,
      wa_otp_enabled: false,
      card_verify_enabled: false,
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('falls back to env vars when fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
      FLAG_PHYSICAL_PRODUCTS: '1',
      FLAG_COURSES_MONTHLY: '',
      FLAG_TZIMMER_CALENDAR: '',
      FLAG_MONTHLY_BILLING: '',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result).toEqual({
      'physical-products': true,
      'courses-monthly': false,
      'tzimmer-calendar': false,
      'monthly-billing': false,
      payment_production: false,
      wa_otp_enabled: false,
      card_verify_enabled: false,
    })
  })

  it('falls back to env vars when fetch returns non-OK status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
      FLAG_TZIMMER_CALENDAR: 'true',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result['tzimmer-calendar']).toBe(true)
  })

  it('uses last known value when fetch fails after initial success', async () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    }
    const t0 = Date.now()

    // First call succeeds
    const mockFetchSuccess = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'physical_products', bool_value: true },
        { key: 'courses_monthly', bool_value: true },
        { key: 'tzimmer_calendar', bool_value: false },
        { key: 'monthly_billing', bool_value: false },
      ],
    })
    const r1 = await getSupabaseFlags(
      t0,
      env as unknown as NodeJS.ProcessEnv,
      mockFetchSuccess as never,
    )

    // Second call fails (after cache expiry)
    const mockFetchFail = vi.fn().mockRejectedValue(new Error('timeout'))
    const r2 = await getSupabaseFlags(
      t0 + 31_000,
      env as unknown as NodeJS.ProcessEnv,
      mockFetchFail as never,
    )

    // Should keep last known value
    expect(r2).toEqual(r1)
    expect(r2['physical-products']).toBe(true)
    expect(r2['courses-monthly']).toBe(true)
  })

  it('handles partial DB results by falling back to env for missing flags', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { key: 'physical_products', bool_value: true },
        // courses_monthly missing from DB
      ],
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
      FLAG_COURSES_MONTHLY: '1',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result['physical-products']).toBe(true)
    expect(result['courses-monthly']).toBe(true) // from env fallback
  })

  it('treats null bool_value as missing and falls back to env', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ key: 'physical_products', bool_value: null }],
    })
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
      FLAG_PHYSICAL_PRODUCTS: 'true',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result['physical-products']).toBe(true)
  })

  it('returns all false when no env vars are set and DB fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    }

    const result = await getSupabaseFlags(
      Date.now(),
      env as unknown as NodeJS.ProcessEnv,
      mockFetch as never,
    )

    expect(result).toEqual({
      'physical-products': false,
      'courses-monthly': false,
      'tzimmer-calendar': false,
      'monthly-billing': false,
      payment_production: false,
      wa_otp_enabled: false,
      card_verify_enabled: false,
    })
  })
})
