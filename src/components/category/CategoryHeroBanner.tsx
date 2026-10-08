import CategoryBannerTracker from '@/components/category/CategoryBannerTracker'
import SmartImage from '@/components/ui/SmartImage'
import { getLiveCategoryBanner } from '@/lib/category-banners/read'
import Link from 'next/link'

/**
 * The hero banner at the top of a category page (STEP 62): the live banner
 * the admin scheduled for this category, or nothing. Nothing is the ordinary
 * state and what keeps every category page byte-identical to before this
 * step: live runs no per-category hero, so the parity gate has nothing to
 * compare against and the banner must cost zero pixels when there is none.
 *
 * A server component, so the row never reaches the browser twice. The
 * counting lives next door in `CategoryBannerTracker`, a zero-DOM client
 * child keyed on the banner's element id.
 *
 * The CTA is the only link. A banner with no CTA is a picture with words,
 * and a picture that is also a link to nowhere in particular is a trap for
 * a screen reader ("link, image, headline") and a tap target with no
 * promise. The admin form says so.
 *
 * `theme` is the text colour: `light` is white over a dark gradient the
 * component adds, `dark` is the catalogue ink over the image as uploaded.
 */
/**
 * The CTA's fill, one per theme. Two constants on two lines, not one
 * ternary: brand yellow never carries white text (brand-contrast.test.ts
 * scans per line), so the yellow button takes the ink and the ink button
 * takes the white.
 */
const CTA_ON_LIGHT_TEXT = 'bg-brand text-heading'
const CTA_ON_DARK_TEXT = 'bg-heading text-white'

export default async function CategoryHeroBanner({
  categoryId,
  now,
}: {
  categoryId: string
  /** Test seam. Defaults to the request clock. */
  now?: Date
}) {
  const banner = await getLiveCategoryBanner(categoryId, now ?? new Date())
  if (!banner) return null

  const elementId = `category-hero-${banner.id}`
  const titleId = `${elementId}-title`
  const light = banner.theme === 'light'

  return (
    <section
      id={elementId}
      aria-labelledby={titleId}
      dir="rtl"
      data-testid="category-hero-banner"
      data-banner-id={banner.id}
      className="relative mb-4 overflow-hidden rounded-lg"
    >
      <div className="relative h-44 w-full md:h-72">
        <SmartImage
          src={banner.image_url}
          alt={banner.image_alt_he}
          fill
          priority
          sizes="(max-width: 767px) 100vw, 1170px"
          className="object-cover"
        />
        {light && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-l from-black/60 via-black/30 to-transparent"
          />
        )}
      </div>
      <div
        className={`absolute inset-0 flex flex-col items-start justify-center gap-2 p-5 md:gap-3 md:p-10 ${
          light ? 'text-white' : 'text-heading'
        }`}
      >
        <h2 id={titleId} className="m-0 max-w-[32ch] text-xl font-bold leading-tight md:text-3xl">
          {banner.title_he}
        </h2>
        {banner.subtitle_he && (
          <p className="m-0 max-w-[48ch] text-sm md:text-lg">{banner.subtitle_he}</p>
        )}
        {banner.cta_href && banner.cta_label_he && (
          <Link
            href={banner.cta_href}
            prefetch={false}
            data-testid="category-hero-cta"
            className={`mt-1 inline-flex min-h-11 items-center rounded px-5 py-2 text-sm font-bold md:text-base ${
              light ? CTA_ON_LIGHT_TEXT : CTA_ON_DARK_TEXT
            }`}
          >
            {banner.cta_label_he}
          </Link>
        )}
      </div>
      <CategoryBannerTracker
        bannerId={banner.id}
        categoryId={banner.category_id}
        elementId={elementId}
      />
    </section>
  )
}
