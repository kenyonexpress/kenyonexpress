import { type JsonLdNode, jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'

/**
 * `AboutPage` + `Organization` for the three trust pages.
 *
 * WHY THE ORGANIZATION NODE IS REPEATED ON EACH OF THEM. Google resolves an
 * `AboutPage` against the entity it is about, and a bare `about: {"@type":
 * "Organization"}` with only a name is a dangling reference. Each page emits
 * the full node under a stable `@id` (`<origin>/#organization`), which is the
 * documented way to say "the same organisation you already saw", so repeating
 * it merges rather than multiplies.
 *
 * `description` IS THE PAGE'S OWN METADATA DESCRIPTION, passed in by the page
 * rather than written again here. Structured data that disagrees with the
 * visible page is what Google penalises, and the cheapest way to disagree is to
 * maintain a second copy of the same sentence. This is the same rule
 * `/faq` follows when it builds `FAQPage` from the array it renders.
 *
 * `sameAs` carries only profiles this repository already links in
 * `SiteFooter`. A profile that is asserted here and nowhere else is an
 * unverifiable claim of identity, which is the one thing `sameAs` is for.
 */

const SCHEMA = 'https://schema.org'

/** Live profiles, copied from the footer's `SOCIALS`. Telegram is `#` there, so it is absent. */
const SAME_AS = [
  'https://www.facebook.com/קניון-Express-114398873446854/',
  'https://www.instagram.com/kenyonexpress',
  'https://www.youtube.com/channel/UCTksP_5SYgaRrqBPgxBehQQ',
  'https://twitter.com/KenyonExpress',
] as const

export interface AboutJsonLdInput {
  /** Site-relative path of the page emitting this, e.g. `/about/how-it-works`. */
  path: string
  /** The `<h1>`, verbatim. */
  name: string
  /** The page's `metadata.description`, verbatim. */
  description: string
}

export function buildAboutJsonLd(input: AboutJsonLdInput, site: string): JsonLdNode[] {
  const origin = site.replace(/\/+$/, '')
  const organizationId = `${origin}/#organization`

  return [
    {
      '@context': SCHEMA,
      '@type': 'Organization',
      '@id': organizationId,
      name: 'KenyonExpress',
      alternateName: 'קניון אקספרס',
      url: origin,
      logo: `${origin}/logo.png`,
      sameAs: [...SAME_AS],
    },
    {
      '@context': SCHEMA,
      '@type': 'AboutPage',
      '@id': `${origin}${input.path}#page`,
      url: `${origin}${input.path}`,
      name: input.name,
      description: input.description,
      inLanguage: 'he-IL',
      isPartOf: { '@type': 'WebSite', url: origin },
      about: { '@id': organizationId },
    },
  ]
}

export default function AboutJsonLd(input: AboutJsonLdInput) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket, and the content is this module's own constants plus the page's own metadata.
      dangerouslySetInnerHTML={{ __html: jsonLdScript(buildAboutJsonLd(input, siteUrl())) }}
    />
  )
}
