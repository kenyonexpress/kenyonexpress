import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The storefront read (STEP 65). Pinned: the anon client asks for one row by
 * category id; the absent table is "no row" logged once; any other error
 * and a throw are "no row"; and `getCategoryGuide` resolves the row over the
 * authored text, the authored text over nothing.
 */
const mock = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  throws: false,
  chain: [] as [string, unknown[]][],
  warn: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ log: { warn: (...a: unknown[]) => mock.warn(...a) } }))
vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => {
    if (mock.throws) throw new Error('no network')
    const builder: Record<string, unknown> = {}
    const chainable = (name: string) =>
      Object.assign((...args: unknown[]) => {
        mock.chain.push([name, args])
        return builder
      }, {})
    for (const name of ['from', 'select', 'eq']) builder[name] = chainable(name)
    builder.maybeSingle = () => {
      mock.chain.push(['maybeSingle', []])
      return Promise.resolve(mock.result)
    }
    return builder
  },
}))

const { getCategoryGuide, getCategoryGuideRow } = await import('./read')

beforeEach(() => {
  mock.result = { data: null, error: null }
  mock.throws = false
  mock.chain.length = 0
  mock.warn.mockReset()
})

describe('getCategoryGuideRow', () => {
  it('reads one row for the category on the anon client', async () => {
    mock.result = {
      data: { category_id: 'c1', title_he: null, body_md: 'גוף', is_published: 'true' },
      error: null,
    }
    const row = await getCategoryGuideRow('c1')
    expect(row).toEqual({ category_id: 'c1', title_he: null, body_md: 'גוף', is_published: true })
    expect(mock.chain).toEqual([
      ['from', ['category_guides']],
      ['select', ['category_id, title_he, body_md, is_published']],
      ['eq', ['category_id', 'c1']],
      ['maybeSingle', []],
    ])
  })

  it('treats the absent table as no row and warns once', async () => {
    mock.result = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }
    expect(await getCategoryGuideRow('c1')).toBeNull()
    expect(await getCategoryGuideRow('c2')).toBeNull()
    expect(mock.warn).toHaveBeenCalledTimes(1)
    expect(mock.warn.mock.calls[0]?.[0]).toBe('category_guides.schema_absent')
  })

  it('treats any other error, a throw and a shapeless row as no row', async () => {
    mock.result = { data: null, error: { code: '57014', message: 'timeout' } }
    expect(await getCategoryGuideRow('c1')).toBeNull()
    expect(mock.warn.mock.calls.at(-1)?.[0]).toBe('category_guides.read_failed')
    mock.result = { data: { category_id: 'c1' }, error: null }
    expect(await getCategoryGuideRow('c1')).toBeNull()
    mock.throws = true
    expect(await getCategoryGuideRow('c1')).toBeNull()
    expect(mock.warn.mock.calls.at(-1)?.[0]).toBe('category_guides.read_threw')
  })
})

describe('getCategoryGuide', () => {
  it('serves the row when there is one', async () => {
    mock.result = {
      data: { category_id: 'c1', title_he: 'שלי', body_md: 'גוף', is_published: true },
      error: null,
    }
    expect(await getCategoryGuide({ id: 'c1', slug: 'vacation' })).toMatchObject({
      source: 'row',
      title_he: 'שלי',
    })
  })

  it('serves the authored guide for a live slug without a row, and nothing for an unknown slug', async () => {
    const guide = await getCategoryGuide({ id: 'c1', slug: 'vacation' })
    expect(guide?.source).toBe('authored')
    expect(guide?.body_md.length).toBeGreaterThan(500)
    expect(await getCategoryGuide({ id: 'c1', slug: 'nope' })).toBeNull()
  })

  it('hides the authored guide behind an unpublished row', async () => {
    mock.result = {
      data: { category_id: 'c1', title_he: null, body_md: 'גוף', is_published: false },
      error: null,
    }
    expect(await getCategoryGuide({ id: 'c1', slug: 'vacation' })).toBeNull()
  })
})
