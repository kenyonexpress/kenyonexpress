import { aboutIntro, aboutMission } from '@/content/about'
import type { LandingPage } from '@/lib/landing/blocks'

/**
 * The landing pages that exist without a database row.
 *
 * THE FALLBACK IS THE DESIGN (the home page CMS states the same rule for a
 * database without 127): migration 262 is pending and may stay pending, and
 * a deployment that cannot reach the table must still answer `/lp/welcome`
 * with a page rather than a 500 or a 404. Once 262 is applied, a database
 * row with the same slug wins; these render only when the table is absent.
 *
 * EVERY STRING HERE ALREADY EXISTS SOMEWHERE ELSE IN THE REPO. The hero copy
 * is the first slide of the measured home page hero, the paragraphs are the
 * about page's intro and mission, and the calls to action point at the
 * catalogue. An authored landing page is not the place to invent a claim
 * (`content/about.ts` explains why a marketing sentence is binding).
 *
 * No variants: an authored page is one page. A/B arms are something an
 * editor configures on a row, where the weights can change without a deploy.
 */
export const AUTHORED_LANDING_PAGES: readonly LandingPage[] = [
  {
    id: 'authored-welcome',
    slug: 'welcome',
    titleHe: 'ברוכים הבאים לקניון אקספרס',
    descriptionHe: aboutIntro,
    hypothesisHe: null,
    status: 'published',
    startsAt: null,
    endsAt: null,
    indexable: false,
    campaign: 'welcome',
    blocks: [
      {
        kind: 'hero',
        headline: 'ברוכים הבאים',
        subheadline: 'מסדרים לך בילוי . . .',
        cta: { label: 'לכל המוצרים', href: '/products' },
      },
      {
        kind: 'text',
        title: aboutMission.heading,
        paragraphs: [aboutIntro, ...aboutMission.paragraphs],
      },
      { kind: 'products', title: 'מבצעים חדשים', slugs: [], limit: 8 },
      { kind: 'cta', label: 'לכל המוצרים', href: '/products' },
    ],
    variants: [],
    updatedAt: null,
    source: 'authored',
  },
]

export function authoredLandingPage(slug: string): LandingPage | null {
  return AUTHORED_LANDING_PAGES.find((page) => page.slug === slug) ?? null
}
