import { HERO_SINGLEFILE_SLIDES } from '@/lib/hero-singlefile-data'
import { describe, expect, it, vi } from 'vitest'
import { AUTHORED_CONTENT, readHomepageContent } from './cms'

/**
 * The rules that keep a CMS from failing the comparison gate.
 *
 * `HERO_SINGLEFILE_SLIDES` carries `imageLayout` values measured off
 * kenyonexpress.co.il to a tenth of a percent. Those numbers are why the home
 * page scores under 11%. Everything below exists so an admin form cannot move
 * them.
 */

function mockAdmin(result: {
  banners?: { data: unknown[] | null; error: unknown }
  sections?: { data: unknown[] | null; error: unknown }
}) {
  // `order()` resolves rather than the chain being a thenable. A `then`
  // property on a plain object is a footgun biome refuses outright, and it is
  // right to: anything that awaits the chain mid-build would resolve it early.
  const build = (payload: { data: unknown[] | null; error: unknown }) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      lte: () => chain,
      order: () => Promise.resolve(payload),
    }
    return chain
  }
  return {
    from: (table: string) =>
      build(
        // Live reads the scheduled VIEW, preview reads the base table. Both
        // names map to the same fixture so a test does not have to know which
        // mode it is in.
        table === 'banners' || table === 'v_banners_live'
          ? (result.banners ?? { data: [], error: null })
          : (result.sections ?? { data: [], error: null }),
      ),
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => (globalThis as { __admin?: unknown }).__admin,
}))

function withAdmin(admin: unknown) {
  ;(globalThis as { __admin?: unknown }).__admin = admin
}

describe('when the tables are not there', () => {
  it('renders the authored page rather than an error', () => {
    // 127 is pending and may stay pending. A deployment that cannot reach the
    // CMS must still serve a home page - the rule the invoice queue already
    // follows for a database without 107.
    withAdmin(
      mockAdmin({
        banners: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
        sections: { data: null, error: { code: '42P01', message: 'relation does not exist' } },
      }),
    )
    return readHomepageContent().then((content) => {
      expect(content.source).toBe('authored')
      expect(content.heroSlides).toEqual(HERO_SINGLEFILE_SLIDES)
    })
  })

  it('falls back on any other read failure too', async () => {
    withAdmin(
      mockAdmin({
        banners: { data: null, error: { code: '08006', message: 'connection failure' } },
        sections: { data: [], error: null },
      }),
    )
    expect((await readHomepageContent()).source).toBe('authored')
  })

  it('falls back when the client itself throws', async () => {
    withAdmin({
      from: () => {
        throw new Error('no admin key')
      },
    })
    expect((await readHomepageContent()).source).toBe('authored')
  })
})

describe('when the tables exist but nobody has configured anything', () => {
  it('treats empty as unconfigured, not as a configured empty page', async () => {
    // Immediately after the migration every query returns zero rows. Rendering
    // a home page with no hero would make installing a migration the thing that
    // emptied the shop.
    withAdmin(
      mockAdmin({ banners: { data: [], error: null }, sections: { data: [], error: null } }),
    )
    const content = await readHomepageContent()
    expect(content.source).toBe('authored')
    expect(content.heroSlides.length).toBeGreaterThan(0)
  })
})

describe('a configured hero', () => {
  const heroRow = {
    id: 'b1',
    placement: 'hero',
    title_he: 'דיל חדש',
    subtitle_he: 'לזמן מוגבל',
    image_url: 'https://cdn.test/a.webp',
    alt_he: 'תמונת דיל',
    link_url: '/products',
    cta_label_he: 'לצפייה',
    position: 0,
  }

  it('inherits the measured layout of the slide it replaces', async () => {
    // The whole point. A slide typed into an admin form has no geometry, and a
    // CMS row that could set its own would let an editor fail compare.mjs from
    // the admin panel with nobody running it.
    withAdmin(
      mockAdmin({ banners: { data: [heroRow], error: null }, sections: { data: [], error: null } }),
    )
    const content = await readHomepageContent()
    expect(content.source).toBe('database')
    expect(content.heroSlides[0]?.imageLayout).toEqual(HERO_SINGLEFILE_SLIDES[0]?.imageLayout)
  })

  it('carries the editor content through', async () => {
    withAdmin(
      mockAdmin({ banners: { data: [heroRow], error: null }, sections: { data: [], error: null } }),
    )
    const slide = (await readHomepageContent()).heroSlides[0]
    expect(slide?.title).toBe('דיל חדש')
    expect(slide?.tagline).toBe('לזמן מוגבל')
    expect(slide?.image_url).toBe('https://cdn.test/a.webp')
    expect(slide?.link_url).toBe('/products')
  })

  it('never renders as the composed welcome or app variant', async () => {
    // Those two paint their own typography - promo_small, promo_large, indent
    // flags - which only reads correctly with the authored copy behind it.
    withAdmin(
      mockAdmin({ banners: { data: [heroRow], error: null }, sections: { data: [], error: null } }),
    )
    expect((await readHomepageContent()).heroSlides[0]?.variant).toBe('product')
  })

  it('gives a slide beyond the authored ones the last authored layout', async () => {
    // Stated cost, not a silent one: a genuinely new hero composition is still
    // a code change.
    const many = Array.from({ length: HERO_SINGLEFILE_SLIDES.length + 2 }, (_, i) => ({
      ...heroRow,
      id: `b${i}`,
      position: i,
    }))
    withAdmin(
      mockAdmin({ banners: { data: many, error: null }, sections: { data: [], error: null } }),
    )
    const content = await readHomepageContent()
    const last = content.heroSlides[content.heroSlides.length - 1]
    expect(last?.imageLayout).toEqual(
      HERO_SINGLEFILE_SLIDES[HERO_SINGLEFILE_SLIDES.length - 1]?.imageLayout,
    )
  })
})

describe('side banners', () => {
  it('are separated from hero slides by placement, not by position', async () => {
    withAdmin(
      mockAdmin({
        banners: {
          data: [
            {
              id: 's1',
              placement: 'side',
              title_he: 'מבצע',
              subtitle_he: null,
              image_url: 'https://cdn.test/s.webp',
              alt_he: 'באנר צד',
              link_url: '/coupons',
              cta_label_he: 'לדילים',
              position: 0,
            },
            {
              id: 'h1',
              placement: 'hero',
              title_he: 'כותרת',
              subtitle_he: null,
              image_url: 'https://cdn.test/h.webp',
              alt_he: 'הירו',
              link_url: null,
              cta_label_he: null,
              position: 0,
            },
          ],
          error: null,
        },
        sections: { data: [], error: null },
      }),
    )
    const content = await readHomepageContent()
    expect(content.heroSlides).toHaveLength(1)
    expect(content.sideBanners).toHaveLength(1)
    expect(content.sideBanners[0]?.altHe).toBe('באנר צד')
  })
})

describe('AUTHORED_CONTENT', () => {
  it('is a complete page on its own', () => {
    expect(AUTHORED_CONTENT.heroSlides.length).toBeGreaterThan(0)
    expect(AUTHORED_CONTENT.sections.map((s) => s.kind)).toContain('hero')
    expect(AUTHORED_CONTENT.sections.map((s) => s.kind)).toContain('deals')
  })

  it('keeps its sections in render order', () => {
    const positions = AUTHORED_CONTENT.sections.map((s) => s.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})
