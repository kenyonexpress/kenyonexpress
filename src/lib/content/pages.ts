import { ABOUT_UPDATED_AT, aboutIntro, aboutSections } from '@/content/about'
import {
  HOW_IT_WORKS_BODY,
  HOW_IT_WORKS_DESCRIPTION,
  HOW_IT_WORKS_TITLE,
} from '@/content/how-it-works'
import { FAQ_UPDATED_AT, type FaqEntry, faqEntries } from '@/content/legal/faq'

/**
 * The content-page model, and the built-in text every page falls back to.
 *
 * =========================================================================
 * WHY THERE IS A FALLBACK AT ALL, WHICH IS THE FIRST THING TO EXPLAIN
 * =========================================================================
 *
 * `migrations/pending/205_content_pages.sql` is WRITTEN AND NOT APPLIED, like
 * everything else in that directory, because applying a migration to production
 * needs an explicit human decision. So the tables do not exist in the database
 * this code talks to, and they may not exist for weeks.
 *
 * A CMS whose pages are blank until a migration lands is a CMS that takes
 * `/about`, `/faq`, `/contact` and `/suppliers` off the site the moment it is
 * merged. Every page here therefore has a BUILT-IN version, which is the text
 * that is on the site today, read from the same typed modules that render it
 * today. The database is an override: a published row wins, and anything else -
 * no table, no row, a draft row, an unreachable database - leaves the built-in
 * text on screen.
 *
 * That also makes the migration safe in the other direction. Applying 205
 * changes nothing visible, because the seeded rows carry exactly this text.
 *
 * =========================================================================
 * WHY SOME PAGES ARE BOUND TO AN EXISTING ROUTE AND SOME ARE NOT
 * =========================================================================
 *
 * The obvious design is `/page/<slug>` for everything. It is wrong for the four
 * pages that already have addresses. `/about`, `/faq`, `/contact` and
 * `/suppliers` are in the sitemap, they carry canonicals, they are linked from
 * the footer, and two of them are indexed from the old WordPress site. Serving
 * the same words at `/page/about` as well would be duplicate content competing
 * with itself, and moving them would throw away whatever ranking they have.
 *
 * So `boundRoute` names the address a page renders at when it already has one.
 * A page with no bound route lives at `/page/<slug>`. `href()` is the only
 * function that decides, which is what keeps the sitemap, the admin's "view"
 * link and the canonical from ever disagreeing.
 *
 * BOUND ROUTES ARE NOT OPERATOR-WRITABLE. Binding is what the ROUTE FILE does
 * by reading a fixed slug; the column only records it so the sitemap and the
 * admin know the address. If it were a form field, an operator could point a
 * page at `/checkout`, and the sitemap would publish a URL that renders
 * something else entirely. `updateContentPage` never writes it.
 *
 * =========================================================================
 * WHY A BOUND PAGE OWNS A SLOT AND NOT THE WHOLE PAGE
 * =========================================================================
 *
 * `/about` is prose from top to bottom, so the page IS the body. `/contact` has
 * a form, a WhatsApp link built from `lib/whatsapp` and an inbox address;
 * `/suppliers` has a numbered process, three fact cards and a lead form. Making
 * those editable as text would mean either deleting the design or inventing a
 * block language rich enough to rebuild it - and the second is how a CMS ends
 * up letting an operator break a page from a text box.
 *
 * So a bound page declares which slot the row owns. `/contact` and `/suppliers`
 * own their introduction; the form beneath stays code. That is the part an
 * operator actually asks to change.
 */

export type ContentPageStatus = 'draft' | 'published'

/**
 * Prose is the restricted markup of `lib/content/markup.ts`. FAQ is a list of
 * question/answer pairs and NOT prose, because `/faq` derives its `FAQPage`
 * JSON-LD from the same array it renders. Flattening it to markup would mean
 * either dropping the rich result or reconstructing pairs by guessing which
 * headings are questions, and a structured-data mismatch is penalised by Google
 * precisely when nobody is looking at it.
 */
export type ContentPageBody =
  | { kind: 'prose'; markup: string }
  | { kind: 'faq'; entries: readonly FaqEntry[] }

export interface ContentPage {
  slug: string
  title: string
  body: ContentPageBody
  /** Overrides `<title>`. Null means the page title is used. */
  seoTitle: string | null
  /** Overrides `<meta name="description">`. Null means the body's excerpt. */
  seoDescription: string | null
  ogImageUrl: string | null
  /** The address this page renders at, or null for `/page/<slug>`. */
  boundRoute: string | null
  status: ContentPageStatus
  /** ISO 8601, or null for a page that has never been published. */
  publishedAt: string | null
  updatedAt: string | null
}

/** The address a page is served at. The only place that decision is made. */
export function contentPageHref(page: Pick<ContentPage, 'slug' | 'boundRoute'>): string {
  return page.boundRoute ?? `/page/${page.slug}`
}

/** `/about`'s prose, rebuilt from the module that renders it today. */
function aboutMarkup(): string {
  const sections = aboutSections.map(
    (section) => `## ${section.heading}\n\n${section.paragraphs.join('\n\n')}`,
  )
  return [aboutIntro, ...sections].join('\n\n')
}

/**
 * The five pages the CMS ships with, keyed by slug.
 *
 * These are simultaneously the seed for migration 205 and the fallback the
 * routes render until it is applied, and that is deliberate: a seed written
 * separately from the fallback is two copies of the same paragraph that drift,
 * and the copy that drifts is whichever one is not on screen.
 */
export const BUILT_IN_PAGES = {
  about: {
    slug: 'about',
    title: 'אודות קניון אקספרס',
    body: { kind: 'prose', markup: aboutMarkup() },
    seoTitle: 'אודות',
    seoDescription:
      'מי אנחנו וכיצד עובדת רכישת קופון בקניון אקספרס: תשלום מקדים, שובר עם QR, יתרה בבית העסק, תוקף וזיכוי אוטומטי בפקיעה.',
    ogImageUrl: null,
    boundRoute: '/about',
    status: 'published',
    publishedAt: ABOUT_UPDATED_AT,
    updatedAt: ABOUT_UPDATED_AT,
  },
  faq: {
    slug: 'faq',
    title: 'שאלות נפוצות',
    body: { kind: 'faq', entries: faqEntries },
    seoTitle: 'שאלות נפוצות',
    seoDescription:
      'שאלות נפוצות על קניון אקספרס: איך עובד קופון, מה משלמים בבית העסק, תוקף, ביטולים, החזרים, ארנק וחשבוניות.',
    ogImageUrl: null,
    boundRoute: '/faq',
    status: 'published',
    publishedAt: FAQ_UPDATED_AT,
    updatedAt: FAQ_UPDATED_AT,
  },
  contact: {
    slug: 'contact',
    title: 'צור קשר',
    // The introduction only. The WhatsApp number, the inbox address and the
    // form below are built from `lib/whatsapp` and `ContactForm`, and a number
    // typed into a text box is a number that can differ from the one the link
    // dials - which [68] already fixed once.
    body: {
      kind: 'prose',
      markup: 'יש שאלה על הזמנה, קופון או משלוח? שלחו הודעה ונחזור אליכם.',
    },
    seoTitle: 'צור קשר',
    seoDescription: 'צרו קשר עם קניון אקספרס: שאלות, הצעות והערות על קופונים, הזמנות ומשלוחים.',
    ogImageUrl: null,
    boundRoute: '/contact',
    status: 'published',
    publishedAt: '2026-08-07',
    updatedAt: '2026-08-07',
  },
  'supplier-signup': {
    slug: 'supplier-signup',
    title: 'הצטרפו כספקים',
    body: {
      kind: 'prose',
      markup:
        'קניון אקספרס מוכרת קופונים של בתי עסק ישראליים. הלקוח משלם כאן מקדמה, מגיע אליכם עם שובר שנסרק במקום, ואת היתרה משלם אצלכם. אנחנו מביאים את הלקוח, אתם נותנים את השירות.',
    },
    seoTitle: 'הצטרפו כספקים',
    seoDescription:
      'בית עסק שרוצה למכור קופונים ומוצרים בקניון אקספרס: איך זה עובד, מה נדרש, ואיך משאירים פרטים.',
    ogImageUrl: null,
    boundRoute: '/suppliers',
    status: 'published',
    publishedAt: '2026-08-07',
    updatedAt: '2026-08-07',
  },
  'how-it-works': {
    slug: 'how-it-works',
    title: HOW_IT_WORKS_TITLE,
    body: { kind: 'prose', markup: HOW_IT_WORKS_BODY },
    seoTitle: HOW_IT_WORKS_TITLE,
    seoDescription: HOW_IT_WORKS_DESCRIPTION,
    ogImageUrl: null,
    // The only one of the five with no existing address, so it is the only one
    // served by `/page/[slug]`.
    boundRoute: null,
    status: 'published',
    publishedAt: '2026-09-09',
    updatedAt: '2026-09-09',
  },
} satisfies Record<string, ContentPage>

/**
 * The slugs a route file may bind to.
 *
 * `satisfies` rather than a `Record<string, ContentPage>` annotation, so this
 * is the five literal keys and not `string`. `getBoundContentPage('abuot')`
 * then fails to compile instead of returning undefined at request time and
 * rendering a page with no title.
 */
export type BuiltInPageSlug = keyof typeof BUILT_IN_PAGES

export const BUILT_IN_PAGE_SLUGS = Object.keys(BUILT_IN_PAGES) as BuiltInPageSlug[]

/**
 * A slug an operator is allowed to create.
 *
 * Lowercase latin, digits and single hyphens. NOT Hebrew, even though every
 * other slug-shaped thing here can be: the catalogue already holds
 * `חיתולי-פמפרס-העתק` and a `₪` inside a slug, and this is a field with no
 * existing rows to be compatible with, so it starts strict. A Hebrew title is
 * what a reader sees; the slug is what a crawler and a support ticket carry.
 */
export const CONTENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Slugs that may never be created through the admin.
 *
 * `page` would produce `/page/page`, and the rest are the five built-ins: a row
 * created with one of those slugs but no bound route would answer at
 * `/page/about` while `/about` answers as well, which is the duplicate-content
 * problem `boundRoute` exists to avoid. The seeded rows themselves are inserted
 * by the migration with their bound routes already set.
 */
export const RESERVED_CONTENT_SLUGS: readonly string[] = ['page', ...BUILT_IN_PAGE_SLUGS]
