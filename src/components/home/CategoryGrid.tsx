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
      <h2 id="home-categories-title" className="mb-4 text-section-title font-bold text-heading">
        קטגוריות
      </h2>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.slug}>
            <Link
              href={`/category/${tile.slug}`}
              className="group flex min-h-11 flex-col items-center rounded-lg border border-border bg-white p-3 text-center transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-square w-full max-w-32">
                <SmartImage
                  src={tile.imageUrl ?? ''}
                  alt=""
                  fill
                  sizes="(max-width: 767px) 45vw, 128px"
                  className="object-contain transition-transform duration-300 group-hover:scale-105"
                  fallbackClassName="absolute inset-0 rounded-md"
                />
              </div>
              <span className="mt-2 block text-sm font-semibold text-heading">{tile.nameHe}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
