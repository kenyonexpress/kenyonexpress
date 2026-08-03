import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Goal 9. Both search routes are unauthenticated and reachable by anyone, and
 * both were doing real query work per request with no ceiling: `/api/search`
 * runs an unindexed ILIKE over name_he + description_he, and
 * `/api/search/suggest` misses its cache on every distinct `q`.
 *
 * These tests pin the two properties that actually matter and that a future
 * refactor could quietly drop:
 *   - the gate is consulted, keyed per IP, and a refusal is a 429 with no
 *     query work behind it
 *   - the two-character floor is checked FIRST, so the empty-typeahead case
 *     never spends a limiter round-trip
 *
 * Verified to fail without the change: removing either checkRateLimit call
 * turns the 429 cases into 200s.
 */

const checkRateLimit = vi.fn()
const getClientIp = vi.fn()
const searchProductsCached = vi.fn()
const from = vi.fn()

vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: () => getClientIp(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))
vi.mock('@/lib/search-server', () => ({
  searchProductsCached: (...args: unknown[]) => searchProductsCached(...args),
}))

const { GET: search } = await import('./route')
const { GET: suggest } = await import('./suggest/route')

beforeEach(() => {
  vi.clearAllMocks()
  getClientIp.mockResolvedValue('203.0.113.7')
  checkRateLimit.mockResolvedValue(true)
  searchProductsCached.mockResolvedValue({ results: [], engine: 'ilike' })
})

function req(path: string, q: string) {
  return new NextRequest(`https://kenyonexpress.co.il${path}?q=${encodeURIComponent(q)}`)
}

describe('/api/search rate limiting', () => {
  it('refuses with 429 and never touches the database when over the ceiling', async () => {
    checkRateLimit.mockResolvedValue(false)

    const res = await search(req('/api/search', 'מקרר'))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited' })
    // The point of the gate: the ILIKE never runs.
    expect(from).not.toHaveBeenCalled()
  })

  it('keys the ceiling per client IP', async () => {
    checkRateLimit.mockResolvedValue(false)

    await search(req('/api/search', 'מקרר'))

    expect(checkRateLimit).toHaveBeenCalledWith('search:203.0.113.7', 120, 300)
  })

  it('does not spend a limiter round-trip below the two-character floor', async () => {
    const res = await search(req('/api/search', 'א'))

    expect(res.status).toBe(200)
    expect(checkRateLimit).not.toHaveBeenCalled()
  })
})

describe('/api/search/suggest rate limiting', () => {
  it('refuses with 429 and never reaches the search engine', async () => {
    checkRateLimit.mockResolvedValue(false)

    const res = await suggest(req('/api/search/suggest', 'מקרר'))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({ error: 'rate_limited' })
    expect(searchProductsCached).not.toHaveBeenCalled()
  })

  it('uses a separate, higher ceiling from the results page', async () => {
    checkRateLimit.mockResolvedValue(false)

    await suggest(req('/api/search/suggest', 'מקרר'))

    expect(checkRateLimit).toHaveBeenCalledWith('search-suggest:203.0.113.7', 300, 300)
  })

  it('lets a normal query through to the engine', async () => {
    const res = await suggest(req('/api/search/suggest', 'מקרר'))

    expect(res.status).toBe(200)
    expect(searchProductsCached).toHaveBeenCalledWith('מקרר', 6)
  })

  it('does not spend a limiter round-trip below the two-character floor', async () => {
    const res = await suggest(req('/api/search/suggest', 'א'))

    expect(res.status).toBe(200)
    expect(checkRateLimit).not.toHaveBeenCalled()
  })
})
