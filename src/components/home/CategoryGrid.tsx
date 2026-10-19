import SmartImage from '@/components/ui/SmartImage'
import { getHomeCategoryTiles } from '@/lib/homepage/below-fold'
import Link from 'next/link'

/**
 * Eight category tiles from the `categories` table, under the deals grid.
 *
 * THIS IS NOT THE STRIP THE HERO OWNS. The five-tile `CategoryStrip` inside the
 * hero column is live's `product-categories-list`, measured, and absent at 380
 * by live's rule - so on a phone the home page had no category navigation at
 * all below the header menu. This grid is the database's own list (menu order,
 * top level, active), photographed with the same ingested files the strip
 * uses, and it sits below the 2600px the parity gate scores.
 *
 * THE CARD (UX07, 14.10.2026), measured before on the build of HEAD at 380 /
 * 768 / 1440 (logs/ux07/before.json): the corner was `rounded-lg`, which this
 * theme resolves to `--radius-lg`, the 25px MODAL corner, so every tile had
 * the radius of a dialog; now `rounded-md`, Electro's 12px elevated
 * card (`--radius-elevated`, mirrored from ELECTRO.radius.elevated). The
 * hover was Tailwind's stock `shadow-md`, a two-layer shadow nothing else on
 * the site paints and one of the values tokens.css forbids ("the only two
 * any component may use"); now `shadow-card-hover`, the Electro hover
 * shadow every other card uses. The photograph zooms 5% on hover inside a
 * box that clips at the same corner, so the zoom stays a zoom and does not
 * grow the card. Every tile has a photograph: `CATEGORY_TILE_IMAGES` covers
 * every live top-level slug, and a label never carries an emoji
 * (`tileLabel`); the picture of the department is the picture.
 */
export default async function CategoryGrid() {
  const tiles = await getHomeCategoryTiles()
  if (tiles.length === 0) return null

  return (
    <section
      aria-labelledby="home-categories-title"
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <h2
        id="home-categories-title"
        className="mb-space-lg text-section-title font-bold text-heading"
      >
        קטגוריות
      </h2>
      <ul className="m-0 grid list-none grid-cols-2 gap-space-md p-0 md:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.slug}>
            <Link
              href={`/category/${tile.slug}`}
              data-category-tile={tile.slug}
              className="group flex min-h-11 flex-col items-center rounded-md border border-border bg-white p-space-md text-center transition-shadow duration-300 hover:shadow-card-hover"
            >
              <div className="relative aspect-square w-full max-w-32 overflow-hidden rounded-md">
                <SmartImage
                  src={tile.imageUrl ?? ''}
                  alt=""
                  fill
                  sizes="(max-width: 767px) 45vw, 128px"
                  className="object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
                  fallbackClassName="absolute inset-0"
                />
              </div>
              <span className="mt-space-sm block text-sm font-semibold text-heading">
                {tile.nameHe}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
