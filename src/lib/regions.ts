/**
 * The seventeen regions live's header offers under "בחר אזור".
 *
 * READ OFF THE LIVE SITE, NOT INVENTED. Extracted 2026-09-03 from the rendered
 * `.secondary-nav` dropdown at 1440, which holds exactly one menu item -- the
 * region selector -- with seventeen links beneath it. The names carry live's own
 * punctuation, including the EN DASH (U+2013) in the three compound regions;
 * writing a hyphen there instead would be a different string in every
 * comparison, every redirect and every JSON-LD block.
 *
 * THE SLUGS ARE LIVE'S SLUGS. Live serves these at `/city/<hebrew>/` with the
 * Hebrew percent-encoded, e.g.
 *
 *   /city/%d7%aa%d7%9c-%d7%90%d7%91%d7%99%d7%91/   ->  /city/תל-אביב/
 *
 * Decoded, they are the strings below. They are kept verbatim rather than
 * transliterated because they are live URLs with whatever inbound links and
 * search rankings seventeen pages have accumulated: a prettier ASCII slug would
 * silently drop every one of them. Next.js routes non-ASCII segments fine, and
 * `encodeURIComponent` at the link boundary is what makes the href legal.
 *
 * Note `פתח תקוה` -- live spells it without the yod (not `פתח תקווה`). That is
 * live's spelling and therefore live's URL, so it is preserved as found.
 */

export type Region = {
  /** Display name, exactly as live renders it. */
  readonly name: string
  /** URL segment, decoded. Encode it at the link boundary, never store encoded. */
  readonly slug: string
  /**
   * Slugs from `@/lib/geo/cities` that fall inside this region.
   *
   * A REGION IS NOT A CITY, and this is the seam between the two ideas. That
   * module holds thirteen individual municipalities with coordinates, keyed by
   * ASCII slug, and drives the `?city=` filter and the near-me distance sort.
   * Live's seventeen entries here are REGIONS: three of them name three
   * municipalities at once ("רמת גן – גבעתיים – בני ברק"), and six name areas
   * with no municipality in that table at all.
   *
   * The mapping is therefore deliberately partial and an empty array is a real,
   * honest answer meaning "no supplier city we know about sits here yet" -- not
   * an oversight to be filled in with a guess. Five regions are empty today:
   * חדרה והסביבה, השפלה, רחובות – נס ציונה, גליל עליון and גולן. Adding a city
   * to `geo/cities.ts` is what fills one in, and regions.test.ts asserts the
   * count so that filling one is a deliberate diff rather than a silent drift.
   */
  readonly cities: readonly string[]
}

export const REGIONS: readonly Region[] = [
  { name: 'תל אביב', slug: 'תל-אביב', cities: ['tel-aviv'] },
  { name: 'רמת גן – גבעתיים – בני ברק', slug: 'רמת-גן-גבעתיים-בני-ברק', cities: ['ramat-gan'] },
  {
    name: 'חולון – בת ים – ראשון לציון',
    slug: 'חולון-בת-ים-ראשון-לציון',
    cities: ['rishon-lezion'],
  },
  { name: 'פתח תקוה', slug: 'פתח-תקוה', cities: ['petah-tikva'] },
  { name: 'השרון', slug: 'השרון', cities: ['herzliya', 'kfar-saba'] },
  { name: 'נתניה והסביבה', slug: 'נתניה-והסביבה', cities: ['netanya'] },
  { name: 'חדרה והסביבה', slug: 'חדרה-והסביבה', cities: [] },
  { name: 'ירושלים והסביבה', slug: 'ירושלים-והסביבה', cities: ['jerusalem'] },
  { name: 'השפלה', slug: 'השפלה', cities: [] },
  { name: 'רחובות – נס ציונה', slug: 'רחובות-נס-ציונה', cities: [] },
  { name: 'אשדוד – אשקלון', slug: 'אשדוד-אשקלון', cities: ['ashdod'] },
  { name: 'חיפה והקריות', slug: 'חיפה-והקריות', cities: ['haifa'] },
  { name: 'גליל תחתון', slug: 'גליל-תחתון', cities: ['tiberias'] },
  { name: 'גליל עליון', slug: 'גליל-עליון', cities: [] },
  { name: 'גולן', slug: 'גולן', cities: [] },
  { name: 'באר שבע והסביבה', slug: 'באר-שבע-והסביבה', cities: ['beer-sheva'] },
  { name: 'אילת', slug: 'אילת', cities: ['eilat'] },
] as const

/**
 * The href for a region page.
 *
 * Encoded here and nowhere else, so the slug stays readable in the data above
 * and in every comparison against it. Trailing slash omitted: live redirects
 * `/city/x` to `/city/x/` and we do not, and adding one would make our own
 * canonical disagree with our own sitemap.
 */
export function regionHref(region: Region): string {
  return `/city/${encodeURIComponent(region.slug)}`
}

/** Look a region up by its decoded slug. Returns undefined for an unknown one. */
export function findRegion(slug: string): Region | undefined {
  return REGIONS.find((r) => r.slug === slug)
}
