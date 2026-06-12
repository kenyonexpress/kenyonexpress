import Link from 'next/link'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { KE_LIVE_CATEGORIES } from '@/lib/ke-live-hero-data'

const CC = ELECTRO_HERO.categoryColumn

export default function HeroCategorySidebar() {
  return (
    <aside
      dir="rtl"
      aria-label="קטגוריות"
      style={{ width: CC.width, color: CC.textColor }}
      className="home-vertical-nav departments-menu-v2 hidden h-full shrink-0 flex-col overflow-hidden border-s border-gray-200 bg-white font-sans lg:flex"
    >
      <div
        aria-hidden="true"
        className="vertical-menu-title departments-menu-v2-title h-14 shrink-0 bg-brand-secondary"
      />

      <nav aria-label="קטגוריות" className="flex-1 overflow-y-auto">
        <ul className="m-0 list-none p-0">
          {KE_LIVE_CATEGORIES.map((cat) => {
            const href = cat.href ?? `/category/${cat.slug}`
            const isSoon = cat.slug === 'courses'

            return (
              <li key={cat.slug} className={cat.highlight ? 'highlight' : undefined}>
                {isSoon ? (
                  <Link
                    href={href}
                    style={{ fontSize: ELECTRO_HERO.typography.categoryLink.size }}
                    className="block border-b border-gray-100 px-4 py-2.5 text-sm font-medium text-heading transition-colors hover:bg-brand-accent hover:text-brand-dark"
                  >
                    {cat.label}
                  </Link>
                ) : (
                  <Link
                    href={href}
                    style={{ fontSize: ELECTRO_HERO.typography.categoryLink.size }}
                    className={`block border-b border-gray-100 px-4 py-2.5 text-heading transition-colors hover:bg-brand-accent hover:text-brand-dark ${
                      cat.highlight ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {cat.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
