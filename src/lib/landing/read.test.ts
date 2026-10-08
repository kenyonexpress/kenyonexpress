import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHORED_LANDING_PAGES } from './authored'

/**
 * The read rules: a missing table renders the authored page, a broken row
 * renders nothing (and says so in the log), a good row renders itself.
 *
 * `'use cache'` is a directive the test runtime ignores, so the live read
 * runs as a plain function here; `cacheLife` / `cacheTag` are mocked away.
 */

type Result = { data: unknown[] | null; error: { code?: string; message?: string } | null }

const state: { result: Result; tables: string[] } = {
  result: { data: [], error: null },
  tables: [],
}

vi.mock('next/cache', () => ({ cacheLife: () => {}, cacheTag: () => {} }))

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...args: unknown[]) => warn(...args), info: () => {}, error: () => {} },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.tables.push(table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve(state.result),
        limit: () => Promise.resolve(state.result),
      }
      return chain
    },
  }),
}))

import {
  listLandingPages,
  readLandingPageForPreview,
  readLiveLandingPage,
  rowToLandingPage,
} from './read'

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'summer',
  title_he: 'קיץ',
  description_he: null,
  hypothesis_he: null,
  starts_at: null,
  ends_at: null,
  indexable: false,
  campaign: null,
  blocks: [{ kind: 'text', paragraphs: ['שלום'] }],
  variants: [
    { key: 'control', weight: 50 },
    { key: 'b', weight: 50 },
  ],
  updated_at: '2026-10-08T00:00:00Z',
}

beforeEach(() => {
  state.result = { data: [], error: null }
  state.tables = []
  warn.mockClear()
})

describe('when 262 is not applied', () => {
  it('renders the authored page for its slug and nothing for another', async () => {
    state.result = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    const welcome = await readLiveLandingPage('welcome')
    expect(welcome?.source).toBe('authored')
    expect(welcome?.slug).toBe('welcome')
    expect(await readLiveLandingPage('nope')).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('lists the authored set and says the table is missing', async () => {
    state.result = { data: null, error: { code: '42P01', message: 'relation does not exist' } }
    const list = await listLandingPages()
    expect(list.tableExists).toBe(false)
    expect(list.pages.map((p) => p.slug)).toEqual(AUTHORED_LANDING_PAGES.map((p) => p.slug))
  })
})

describe('reading rows', () => {
  it('reads the live VIEW for the public and the base table for the preview', async () => {
    state.result = { data: [ROW], error: null }
    await readLiveLandingPage('summer')
    await readLandingPageForPreview('summer')
    expect(state.tables).toEqual(['v_landing_pages_live', 'landing_pages'])
  })

  it('maps a row to a page', async () => {
    state.result = { data: [ROW], error: null }
    const page = await readLiveLandingPage('summer')
    expect(page).toMatchObject({
      slug: 'summer',
      titleHe: 'קיץ',
      status: 'published',
      source: 'database',
      variants: [
        { key: 'control', weight: 50 },
        { key: 'b', weight: 50 },
      ],
    })
  })

  it('treats a row that fails the schema as absent, and logs the slug', async () => {
    state.result = {
      data: [{ ...ROW, blocks: [{ kind: 'cta', label: 'x', href: 'https://evil.example' }] }],
      error: null,
    }
    expect(await readLiveLandingPage('summer')).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      'landing.row_invalid',
      expect.objectContaining({ slug: 'summer' }),
    )
  })

  it('answers null and logs on any other database error', async () => {
    state.result = { data: null, error: { code: '08006', message: 'connection failure' } }
    expect(await readLiveLandingPage('summer')).toBeNull()
    expect(warn).toHaveBeenCalledWith('landing.read_failed', expect.anything())
  })

  it('refuses a slug the route would refuse without touching the database', async () => {
    expect(await readLiveLandingPage('Bad Slug')).toBeNull()
    expect(state.tables).toEqual([])
  })

  it('keeps the invalid rows out of the list but names them', async () => {
    state.result = {
      data: [
        ROW,
        { ...ROW, id: '22222222-2222-4222-8222-222222222222', slug: 'broken', variants: 'x' },
      ],
      error: null,
    }
    const list = await listLandingPages()
    expect(list.pages.map((p) => p.slug)).toEqual(['summer'])
    expect(list.problems.map((p) => p.slug)).toEqual(['broken'])
  })
})

describe('rowToLandingPage', () => {
  it('reads status off the base table and defaults it to published off the view', () => {
    const live = rowToLandingPage(ROW)
    expect('page' in live && live.page.status).toBe('published')
    const draft = rowToLandingPage({ ...ROW, status: 'draft' })
    expect('page' in draft && draft.page.status).toBe('draft')
  })
})
