import type { HeroSlide } from '@/components/home/HeroSlider'
import { HERO_SINGLEFILE_SLIDES } from '@/lib/hero-singlefile-data'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The home page, read from the database when it is there and from the authored
 * constants when it is not.
 *
 * THE FALLBACK IS THE DESIGN, NOT A STOPGAP FOR THE PENDING MIGRATION.
 * `migrations/pending/127` has not been applied and may not be for a while, but
 * even after it is, a deployment that cannot reach these tables must still
 * render a home page. This is the rule `server/payments/invoices.ts` already
 * follows for a database without 107: a missing table is an ordinary state, not
 * an error.
 *
 * ⚠️ THE CMS SUPPLIES CONTENT, NEVER GEOMETRY, and that boundary is what keeps
 * the comparison gate meaningful. Look at `HERO_SINGLEFILE_SLIDES`: each slide
 * carries an `imageLayout` measured off kenyonexpress.co.il to a tenth of a
 * percent, plus indent flags that reproduce specific `rs-layer` offsets. Those
 * numbers are why the home page scores under 11%.
 *
 * A slide typed into an admin form has none of that. If a CMS row could set its
 * own layout, an editor could move the hero image and fail `compare.mjs` from
 * the admin panel, with nobody running it. So a database slide inherits the
 * layout of the authored slide in the same position, and the admin form has no
 * geometry fields at all.
 *
 * WHAT THAT COSTS, said plainly: a fifth database slide, beyond the authored
 * ones, gets the last authored layout rather than one of its own. Adding a
 * genuinely new hero composition is still a code change. That is the correct
 * trade for a page whose fidelity is a gate.
 *
 * ⚠️ THERE IS NO CLOCK IN THIS FILE, and that is not a style choice. The first
 * version computed `new Date().toISOString()` and passed it as a filter;
 * `next build` refused it, because under `cacheComponents` reading the current
 * time in a statically prerendered Server Component is an error. The home page
 * would have had to go dynamic to keep a schedule, and the hero is the LCP
 * element.
 *
 * The window now lives in `v_banners_live` / `v_homepage_sections_live`, which
 * compare against the DATABASE's `now()`. The page reads a plain view with no
 * time in it, and the schedule is evaluated against one clock rather than
 * against whichever server rendered the page.
 *
 * ⚠️ THIS READ IS NOT CACHED, and the home page stays static anyway because
 * `<CmsHero>` sits behind a Suspense boundary whose fallback is the authored
 * hero. `next build` refuses an uncached read in a prerendered route, and
 * caching it was the first fix tried; the boundary is better, because the
 * static shell then paints the exact markup the comparison gate measured
 * rather than a cached copy of it.
 *
 * The cost, stated: one query per uncached home page request. It is a single
 * indexed read against two small views, and until 127 is applied it is a
 * 42P01 that returns immediately. Adding `'use cache'` on top is a reasonable
 * next step and is not done here, because a cache with no invalidation hook
 * would hide an editor's change for an hour.
 */

export type HomepageSectionKind =
  | 'hero'
  | 'categories'
  | 'benefits'
  | 'deals'
  | 'featured'
  | 'city_deals'
  | 'banner_row'

export interface HomepageSection {
  id: string
  kind: HomepageSectionKind
  titleHe: string | null
  subtitleHe: string | null
  position: number
  config: Record<string, unknown>
}

export interface SideBanner {
  id: string
  titleHe: string | null
  subtitleHe: string | null
  imageUrl: string
  altHe: string
  linkUrl: string | null
  ctaLabelHe: string | null
}

export interface HomepageContent {
  heroSlides: HeroSlide[]
  sideBanners: SideBanner[]
  sections: HomepageSection[]
  /** Which source actually rendered. Surfaced to the admin preview, never to a shopper. */
  source: 'database' | 'authored'
}

/** The order the authored page renders in, used when no rows exist. */
const AUTHORED_SECTIONS: HomepageSection[] = [
  { id: 'a-hero', kind: 'hero', titleHe: null, subtitleHe: null, position: 0, config: {} },
  {
    id: 'a-categories',
    kind: 'categories',
    titleHe: null,
    subtitleHe: null,
    position: 10,
    config: {},
  },
  { id: 'a-benefits', kind: 'benefits', titleHe: null, subtitleHe: null, position: 20, config: {} },
  { id: 'a-deals', kind: 'deals', titleHe: null, subtitleHe: null, position: 30, config: {} },
]

export const AUTHORED_CONTENT: HomepageContent = {
  heroSlides: HERO_SINGLEFILE_SLIDES,
  sideBanners: [],
  sections: AUTHORED_SECTIONS,
  source: 'authored',
}

/** Postgres: undefined_table, i.e. 127 has not been applied to this database. */
const UNDEFINED_TABLE = '42P01'

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === UNDEFINED_TABLE || /relation .* does not exist/i.test(error.message ?? '')
}

type BannerRow = {
  id: string
  placement: string
  title_he: string | null
  subtitle_he: string | null
  image_url: string
  alt_he: string
  link_url: string | null
  cta_label_he: string | null
  position: number
}

type SectionRow = {
  id: string
  kind: string
  title_he: string | null
  subtitle_he: string | null
  position: number
  config: Record<string, unknown> | null
}

/**
 * A database hero row, wearing the layout of the authored slide it replaces.
 *
 * `variant` is fixed to 'product' for database slides: the 'welcome' and 'app'
 * variants paint their own composed typography (`promo_small`, `promo_large`,
 * indent flags) that only makes sense with the authored copy behind it.
 */
function toHeroSlide(row: BannerRow, index: number): HeroSlide {
  const authored =
    HERO_SINGLEFILE_SLIDES[index] ?? HERO_SINGLEFILE_SLIDES[HERO_SINGLEFILE_SLIDES.length - 1]

  return {
    id: `cms-${row.id}`,
    variant: 'product',
    title: row.title_he,
    tagline: row.subtitle_he,
    image_url: row.image_url,
    link_url: row.link_url,
    // Geometry is inherited, never authored in the admin. See the file header.
    imageLayout: authored?.imageLayout,
  }
}

/**
 * Reads the configured home page.
 *
 * `preview` ignores the schedule, so an editor can see a campaign that has not
 * started. It is a parameter rather than a column because a preview copy of
 * every row is a second version of the page that drifts from the live one.
 *
 * Never throws. A home page that 500s because a CMS query failed is strictly
 * worse than one that renders its authored default.
 */
export async function readHomepageContent(
  options: { preview?: boolean } = {},
): Promise<HomepageContent> {
  try {
    const admin = createAdminClient()

    // Live reads the VIEW, which applies the schedule against the database's
    // own clock. Preview reads the base table, which carries no window at all -
    // that is the whole difference between the two, and it is one table name
    // rather than a branch in a filter.
    const bannerSource = options.preview ? 'banners' : 'v_banners_live'
    const sectionSource = options.preview ? 'homepage_sections' : 'v_homepage_sections_live'

    const [banners, sections] = await Promise.all([
      admin
        .from(bannerSource)
        .select(
          'id, placement, title_he, subtitle_he, image_url, alt_he, link_url, cta_label_he, position',
        )
        .order('position', { ascending: true }) as unknown as Promise<{
        data: BannerRow[] | null
        error: { code?: string; message?: string } | null
      }>,
      admin
        .from(sectionSource)
        .select('id, kind, title_he, subtitle_he, position, config')
        .order('position', { ascending: true }) as unknown as Promise<{
        data: SectionRow[] | null
        error: { code?: string; message?: string } | null
      }>,
    ])

    if (isMissingTable(banners.error) || isMissingTable(sections.error)) {
      // 127 is not applied. Expected, and silent: logging it every request
      // would be a line per page view for a state that is normal.
      return AUTHORED_CONTENT
    }

    if (banners.error || sections.error) {
      log.warn('homepage.cms_read_failed', {
        reason: banners.error?.message ?? sections.error?.message,
      })
      return AUTHORED_CONTENT
    }

    const bannerRows = banners.data ?? []
    const heroRows = bannerRows.filter((row) => row.placement === 'hero')
    const sideRows = bannerRows.filter((row) => row.placement === 'side')
    const sectionRows = sections.data ?? []

    // An EMPTY table is not a configured empty page. Before an editor has
    // touched anything, every one of these queries returns zero rows, and a
    // home page with no hero would be the result of installing a migration.
    if (heroRows.length === 0 && sectionRows.length === 0) return AUTHORED_CONTENT

    return {
      heroSlides: heroRows.length > 0 ? heroRows.map(toHeroSlide) : HERO_SINGLEFILE_SLIDES,
      sideBanners: sideRows.map((row) => ({
        id: row.id,
        titleHe: row.title_he,
        subtitleHe: row.subtitle_he,
        imageUrl: row.image_url,
        altHe: row.alt_he,
        linkUrl: row.link_url,
        ctaLabelHe: row.cta_label_he,
      })),
      sections:
        sectionRows.length > 0
          ? sectionRows.map((row) => ({
              id: row.id,
              kind: row.kind as HomepageSectionKind,
              titleHe: row.title_he,
              subtitleHe: row.subtitle_he,
              position: row.position,
              config: row.config ?? {},
            }))
          : AUTHORED_SECTIONS,
      source: 'database',
    }
  } catch (error) {
    log.warn('homepage.cms_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return AUTHORED_CONTENT
  }
}
