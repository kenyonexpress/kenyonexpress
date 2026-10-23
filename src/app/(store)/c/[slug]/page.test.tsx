import { getCategoryBySlug } from '@/lib/category-page'
import { getCityProducts } from '@/lib/city-page'
import { notFound, redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('@/data/cities', () => ({
  CITIES: [
    { slug: 'tel-aviv', name: 'תל אביב' },
    { slug: 'jerusalem', name: 'ירושלים' },
  ],
  cityBySlugName: (slug: string) => {
    const cities = [
      { slug: 'tel-aviv', name: 'תל אביב' },
      { slug: 'jerusalem', name: 'ירושלים' },
    ]
    return cities.find((c) => c.slug === slug) ?? null
  },
}))

vi.mock('@/lib/city-page', () => ({
  getCityProducts: vi.fn(() => Promise.resolve([])),
}))

vi.mock('@/lib/category-page', () => ({
  getCategoryBySlug: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound')
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))

const CombinedSlugPage = (await import('./page')).default as unknown as (props: {
  params: Promise<{ slug: string }>
}) => Promise<unknown>

describe('/c/[slug] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles city slugs and renders city page', async () => {
    const params = Promise.resolve({ slug: 'tel-aviv' })
    await expect(CombinedSlugPage({ params })).resolves.toBeDefined()
    expect(getCityProducts).toHaveBeenCalledWith('תל אביב')
  })

  it('handles another city slug', async () => {
    const params = Promise.resolve({ slug: 'jerusalem' })
    await expect(CombinedSlugPage({ params })).resolves.toBeDefined()
    expect(getCityProducts).toHaveBeenCalledWith('ירושלים')
  })

  it('redirects category slugs to /category route', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValueOnce({
      id: 'cat-1',
      slug: 'electronics',
      name_he: 'אלקטרוניקה',
      description_he: null,
      parent_id: null,
      image_url: null,
    })

    const params = Promise.resolve({ slug: 'electronics' })
    await expect(CombinedSlugPage({ params })).rejects.toThrow('redirect:/category/electronics')
    expect(redirect).toHaveBeenCalledWith('/category/electronics')
  })

  it('calls notFound for unknown slugs', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValueOnce(null)

    const params = Promise.resolve({ slug: 'unknown-slug' })
    await expect(CombinedSlugPage({ params })).rejects.toThrow('notFound')
    expect(notFound).toHaveBeenCalled()
  })

  it('prioritizes cities over categories with same slug', async () => {
    // Even if a category exists with the same slug, city takes precedence
    vi.mocked(getCategoryBySlug).mockResolvedValueOnce({
      id: 'cat-1',
      slug: 'tel-aviv',
      name_he: 'תל אביב קטגוריה',
      description_he: null,
      parent_id: null,
      image_url: null,
    })

    const params = Promise.resolve({ slug: 'tel-aviv' })
    await expect(CombinedSlugPage({ params })).resolves.toBeDefined()
    expect(getCityProducts).toHaveBeenCalledWith('תל אביב')
    // getCategoryBySlug should not even be called since city matched first
  })
})

describe('generateStaticParams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all city slugs', async () => {
    const { generateStaticParams } = await import('./page')
    const params = generateStaticParams()
    expect(params).toEqual([{ slug: 'tel-aviv' }, { slug: 'jerusalem' }])
  })
})

describe('generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates metadata for city slugs', async () => {
    const { generateMetadata } = await import('./page')
    const params = Promise.resolve({ slug: 'tel-aviv' })
    const metadata = await generateMetadata({ params })

    expect(metadata.title).toBe('דילים בתל אביב')
    expect(metadata.description).toContain('תל אביב')
  })

  it('generates metadata for category slugs', async () => {
    const { generateMetadata } = await import('./page')

    vi.mocked(getCategoryBySlug).mockResolvedValueOnce({
      id: 'cat-1',
      slug: 'electronics',
      name_he: 'אלקטרוניקה',
      description_he: 'מוצרי אלקטרוניקה',
      parent_id: null,
      image_url: null,
    })

    const params = Promise.resolve({ slug: 'electronics' })
    const metadata = await generateMetadata({ params })

    expect(metadata.title).toBe('אלקטרוניקה')
    expect(metadata.description).toBe('מוצרי אלקטרוניקה')
  })

  it('returns empty metadata for unknown slugs', async () => {
    const { generateMetadata } = await import('./page')

    vi.mocked(getCategoryBySlug).mockResolvedValueOnce(null)

    const params = Promise.resolve({ slug: 'unknown' })
    const metadata = await generateMetadata({ params })

    expect(metadata).toEqual({})
  })
})
