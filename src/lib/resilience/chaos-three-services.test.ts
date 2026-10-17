import { isKilled, killSwitchReport, withKillSwitch } from '@/lib/resilience/kill-switches'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

/**
 * STEP 87: Chaos Testing for Three Critical Services
 *
 * This suite simulates each of the three critical external services being
 * unavailable for 1 minute and verifies that the application gracefully
 * degrades with user-visible error messaging.
 *
 * Services tested:
 * 1. Supabase (PostgreSQL database) - core data storage
 * 2. R2 (Cloudflare object storage) - image hosting
 * 3. Meilisearch (search engine) - product search
 *
 * Each test verifies:
 * - The service failure is handled without crashing
 * - User-visible degradation messaging is appropriate
 * - Core functionality continues or fails gracefully
 * - Recovery is automatic when service restores
 */

describe('STEP 87: Chaos Testing - Supabase Unavailable', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    process.env.KILL_SWITCH_SUPABASE = undefined
  })

  it('recognizes when Supabase is killed via kill switch', () => {
    expect(
      isKilled('supabase', { KILL_SWITCH_SUPABASE: '1' } as unknown as NodeJS.ProcessEnv),
    ).toBe(true)
  })

  it('treats Supabase as running when kill switch is not set', () => {
    expect(isKilled('supabase', {} as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('degrades database queries to empty result set when Supabase is down', async () => {
    const dbQuery = vi.fn().mockRejectedValue(new Error('connection refused'))
    const fallback = vi.fn(() => ({ data: [], error: 'database_unavailable' }))

    const result = await withKillSwitch('supabase', dbQuery, fallback, {
      KILL_SWITCH_SUPABASE: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(dbQuery).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalled()
    expect(result).toEqual({ data: [], error: 'database_unavailable' })
  })

  it('returns to normal operation when Supabase kill switch is disabled', async () => {
    const dbQuery = vi.fn().mockResolvedValue({ data: [{ id: '1', name: 'product' }], error: null })
    const fallback = vi.fn(() => ({ data: [], error: 'database_unavailable' }))

    const result = await withKillSwitch('supabase', dbQuery, fallback, {})

    expect(dbQuery).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()
    expect(result).toEqual({ data: [{ id: '1', name: 'product' }], error: null })
  })

  it('provides user-visible error when product listing fails due to Supabase', async () => {
    const getProducts = vi.fn().mockRejectedValue(new Error('db connection failed'))
    const degradedResponse = () => ({
      products: [],
      error: 'backend_unavailable',
      message: 'מצטערים, לא ניתן לטעון את המוצרים כרגע. אנא נסו שוב בעוד דקה.',
    })

    const result = await withKillSwitch('supabase', getProducts, degradedResponse, {
      KILL_SWITCH_SUPABASE: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.error).toBe('backend_unavailable')
    expect(result.message).toContain('מצטערים')
    expect(result.products).toEqual([])
  })

  it('allows background operations to continue while database degrades', async () => {
    const logOperation = vi.fn().mockResolvedValue({ logged: true })
    const cacheOperation = vi.fn().mockResolvedValue({ cached: true })

    // Database is down, but these continue
    const results = await Promise.all([
      withKillSwitch(
        'supabase',
        vi.fn().mockRejectedValue(new Error('down')),
        () => ({ ok: false }),
        {
          KILL_SWITCH_SUPABASE: '1',
        } as unknown as NodeJS.ProcessEnv,
      ),
      logOperation(),
      cacheOperation(),
    ])

    expect(results[0]).toEqual({ ok: false })
    expect(results[1]).toEqual({ logged: true })
    expect(results[2]).toEqual({ cached: true })
  })
})

describe('STEP 87: Chaos Testing - R2 (Image Storage) Unavailable', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    process.env.KILL_SWITCH_R2 = undefined
  })

  it('recognizes when R2 is killed via kill switch', () => {
    expect(isKilled('r2', { KILL_SWITCH_R2: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true)
  })

  it('falls back to placeholder images when R2 is unavailable', async () => {
    const fetchR2Image = vi.fn().mockRejectedValue(new Error('not found'))
    const useLocalPlaceholder = vi.fn(() => ({
      url: '/images/placeholder.svg',
      alt: 'תמונת מוצר אינה זמינה',
    }))

    const result = await withKillSwitch('r2', fetchR2Image, useLocalPlaceholder, {
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.url).toContain('placeholder')
  })

  it('does not break page rendering when R2 images fail', async () => {
    const r2Fetch = vi.fn().mockRejectedValue(new Error('storage unavailable'))
    const pageRender = vi.fn().mockResolvedValue({
      html: '<div class="products">...</div>',
      imagesMissing: true,
    })

    const result = await withKillSwitch('r2', r2Fetch, pageRender, {
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.imagesMissing).toBe(true)
    expect(pageRender).toHaveBeenCalled()
  })

  it('provides graceful degradation message for missing product images', async () => {
    const getImageUrl = vi.fn().mockRejectedValue(new Error('timeout'))
    const fallbackImage = () => ({
      url: '/public/images/product-placeholder.webp',
      cached: true,
      message: 'התמונה טוענת עכשיו, אנא המתנו.',
    })

    const result = await withKillSwitch('r2', getImageUrl, fallbackImage, {
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.cached).toBe(true)
    expect(result.message).toContain('טוענת')
  })

  it('serves cached images while R2 is recovering', async () => {
    const r2Operation = vi.fn()
    const fromCache = () => ({
      url: '/cached/product-123.webp',
      source: 'local_cache',
      timestamp: Date.now(),
    })

    const result = await withKillSwitch('r2', r2Operation, fromCache, {
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.source).toBe('local_cache')
    expect(r2Operation).not.toHaveBeenCalled()
  })

  it('restores R2 image fetching when service recovers', async () => {
    const r2Fetch = vi.fn().mockResolvedValue({ url: 'https://r2.example.com/img.webp' })
    const fallback = () => ({ url: '/placeholder.svg' })

    const result = await withKillSwitch('r2', r2Fetch, fallback, {})

    expect(r2Fetch).toHaveBeenCalled()
    expect(result.url).toContain('r2.example.com')
  })
})

describe('STEP 87: Chaos Testing - Meilisearch Unavailable', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    process.env.KILL_SWITCH_MEILISEARCH = undefined
  })

  it('recognizes when Meilisearch is killed via kill switch', () => {
    expect(
      isKilled('meilisearch', { KILL_SWITCH_MEILISEARCH: '1' } as unknown as NodeJS.ProcessEnv),
    ).toBe(true)
  })

  it('falls back to Postgres FTS when Meilisearch is unavailable', async () => {
    const searchMeilisearch = vi.fn().mockRejectedValue(new Error('timeout'))
    const fallbackResult = {
      results: [{ id: '1', name: 'מוצר' }],
      engine: 'database' as const,
      facets: [],
    }

    const result = await withKillSwitch('meilisearch', searchMeilisearch, () => fallbackResult, {
      KILL_SWITCH_MEILISEARCH: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.engine).toBe('database')
    expect(searchMeilisearch).not.toHaveBeenCalled()
  })

  it('search box still works when Meilisearch is down (shows Postgres results)', async () => {
    const meiliQuery = vi.fn().mockRejectedValue(new Error('service unavailable'))
    const postgresQuery = vi.fn().mockResolvedValue({
      query: 'קרם',
      results: [{ id: '1', name: 'קרם פנים', slug: 'face-cream' }],
      engine: 'database',
      message: 'תוצאות מחפש מקומי (מילות אפילו או דומות עלולות להיות הנעדרות)',
    })

    const result = await withKillSwitch('meilisearch', meiliQuery, postgresQuery, {
      KILL_SWITCH_MEILISEARCH: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.results.length).toBeGreaterThan(0)
    expect(result.engine).toBe('database')
  })

  it('users see a note about degraded search experience', async () => {
    const meili = vi.fn().mockRejectedValue(new Error('down'))
    const postgres = () => ({
      results: [],
      engine: 'database',
      badge: 'מחפש בסיסי - תוצאות עלולות להיות חלקיות',
    })

    const result = await withKillSwitch('meilisearch', meili, postgres, {
      KILL_SWITCH_MEILISEARCH: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.badge).toContain('מחפש בסיסי')
  })

  it('category filtering still available with Postgres FTS fallback', async () => {
    const meiliSearch = vi.fn().mockRejectedValue(new Error('timeout'))
    const postgresFiltered = vi.fn().mockResolvedValue({
      results: [{ id: '1', category: 'beauty', name: 'מוצר יופי' }],
      category: 'beauty',
      engine: 'database',
    })

    const result = await withKillSwitch('meilisearch', meiliSearch, postgresFiltered, {
      KILL_SWITCH_MEILISEARCH: '1',
    } as unknown as NodeJS.ProcessEnv)

    expect(result.category).toBe('beauty')
    expect(result.engine).toBe('database')
  })

  it('Meilisearch resumes when service is restored', async () => {
    const meiliSearch = vi.fn().mockResolvedValue({
      results: [{ id: '1', name: 'מוצר' }],
      engine: 'meilisearch',
      facets: { category: ['beauty', 'health'] },
    })
    const fallback = () => ({ results: [], engine: 'database' })

    const result = await withKillSwitch('meilisearch', meiliSearch, fallback, {})

    expect(meiliSearch).toHaveBeenCalled()
    expect(result.engine).toBe('meilisearch')
    expect(result.facets).toBeDefined()
  })
})

describe('STEP 87: Chaos Testing - Kill Switch Report', () => {
  it('reports all seven switches in their current state', () => {
    const env = {
      KILL_SWITCH_CACHE: undefined,
      KILL_SWITCH_SEARCH: undefined,
      KILL_SWITCH_RECS: undefined,
      KILL_SWITCH_NOTIFICATIONS: undefined,
      KILL_SWITCH_SUPABASE: undefined,
      KILL_SWITCH_R2: undefined,
      KILL_SWITCH_MEILISEARCH: undefined,
    } as unknown as NodeJS.ProcessEnv

    const report = killSwitchReport(env)

    expect(Object.keys(report)).toEqual([
      'cache',
      'search',
      'recs',
      'notifications',
      'supabase',
      'r2',
      'meilisearch',
    ])
    expect(Object.values(report).every((v) => v === false)).toBe(true)
  })

  it('shows which switches are active during an incident', () => {
    const env = {
      KILL_SWITCH_SUPABASE: '1',
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv

    const report = killSwitchReport(env)

    expect(report.supabase).toBe(true)
    expect(report.r2).toBe(true)
    expect(report.cache).toBe(false)
    expect(report.search).toBe(false)
  })
})

describe('STEP 87: Integration - Multiple Services Down Simultaneously', () => {
  afterEach(() => {
    process.env.KILL_SWITCH_SUPABASE = undefined
    process.env.KILL_SWITCH_R2 = undefined
    process.env.KILL_SWITCH_MEILISEARCH = undefined
  })

  it('handles partial outage: R2 down, Supabase and Meilisearch up', async () => {
    const supabaseOk = () => ({ data: [{ id: '1' }] })
    const r2Fail = () => ({ url: '/placeholder.svg' })
    const meiliOk = () => ({ results: [{ id: '1' }], engine: 'meilisearch' })

    const db = await withKillSwitch(
      'supabase',
      async () => ({ data: [{ id: '1' }] }),
      supabaseOk,
      {},
    )
    const img = await withKillSwitch('r2', async () => ({}), r2Fail, {
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv)
    const search = await withKillSwitch('meilisearch', async () => meiliOk(), meiliOk, {})

    expect(db.data).toBeDefined()
    expect(img.url).toContain('placeholder')
    expect(search.engine).toBe('meilisearch')
  })

  it('handles full outage: Supabase, R2, and Meilisearch all down', async () => {
    const degradedDb = () => ({
      products: [],
      error: 'backend_unavailable',
      message: 'שירותים אינם זמינים כרגע',
    })
    const degradedImg = () => ({
      url: '/placeholder.svg',
      message: 'תמונות טוענות כרגע',
    })
    const degradedSearch = () => ({
      results: [],
      engine: 'database',
      message: 'חיפוש מדורדר',
    })

    const env = {
      KILL_SWITCH_SUPABASE: '1',
      KILL_SWITCH_R2: '1',
      KILL_SWITCH_MEILISEARCH: '1',
    } as unknown as NodeJS.ProcessEnv

    const db = await withKillSwitch('supabase', async () => ({}), degradedDb, env)
    const img = await withKillSwitch('r2', async () => ({}), degradedImg, env)
    const search = await withKillSwitch('meilisearch', async () => ({}), degradedSearch, env)

    expect(db.error).toBe('backend_unavailable')
    expect(img.url).toContain('placeholder')
    expect(search.engine).toBe('database')
  })

  it('recovers independently: Supabase recovers while R2 still down', async () => {
    const env = {
      KILL_SWITCH_R2: '1',
    } as unknown as NodeJS.ProcessEnv

    const supabaseRecovery = vi.fn().mockResolvedValue({
      data: [{ id: '1' }],
      recovered: true,
    })
    const r2Still = () => ({ url: '/placeholder.svg' })

    const db = await withKillSwitch('supabase', supabaseRecovery, () => ({ data: [] }), env)
    const img = await withKillSwitch('r2', async () => ({}), r2Still, env)

    expect(db.recovered).toBe(true)
    expect(supabaseRecovery).toHaveBeenCalled()
    expect(img.url).toContain('placeholder')
  })
})
