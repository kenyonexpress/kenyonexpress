import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

export type ChipCategory = { slug: string; name_he: string }

/**
 * One row of category chips: "all" plus every category, the current one marked.
 *
 * Plain links, not client state: each chip is a real URL (`/category/<slug>`),
 * so it works without JavaScript, can be opened in a new tab, and is crawlable.
 * The row scrolls sideways inside its own box on a phone so the page body never
 * does. `aria-current="page"` carries the selected state for a screen reader;
 * colour alone would not.
 */
export default function CategoryChips({
  categories,
  currentSlug,
}: {
  categories: readonly ChipCategory[]
  currentSlug?: string
}) {
  if (categories.length === 0) return null
  return (
    <nav aria-label={t('categoryChips.label')} className="category-chips">
      <ul className="category-chips__list">
        <li>
          <Link
            href="/products"
            className="category-chips__chip"
            aria-current={currentSlug ? undefined : 'page'}
          >
            {t('categoryChips.all')}
          </Link>
        </li>
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/category/${category.slug}`}
              className="category-chips__chip"
              aria-current={category.slug === currentSlug ? 'page' : undefined}
            >
              {category.name_he}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
