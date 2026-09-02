import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { KE_LIVE_CATEGORIES } from '@/lib/ke-live-hero-data'
import Link from 'next/link'

const CC = ELECTRO_HERO.categoryColumn

/** refs/ke_live_singlefile-hero.css — .departments-menu-v2 .departments-menu-v2-title + .dropdown-menu */
const MENU_LI_STYLE = { padding: '0 1em' } as const
const MENU_LINK_STYLE = {
  padding: '6.5px 5px 6.5px 0',
  // 14px explicitly: the live rows are 34.66px = 2x6.5 padding + 14x1.5 line
  // + border. Inheriting the 16px body size made every row 38-40px, which
  // accumulated to a 17px drift by the fourth row and pushed the whole list
  // past live's.
  fontSize: 14,
  lineHeight: 1.5,
  whiteSpace: 'normal' as const,
  borderBottom: '1px solid var(--color-border)',
} as const

export default function HeroCategorySidebar() {
  const lastSlug = KE_LIVE_CATEGORIES.at(-1)?.slug

  return (
    <aside
      dir="rtl"
      aria-label="קטגוריות"
      style={{ width: CC.width, color: CC.textColor }}
      className="home-vertical-nav departments-menu-v2 hidden h-full shrink-0 flex-col overflow-hidden bg-white font-sans lg:flex"
    >
      <div className="dropdown show-dropdown flex h-full min-h-0 flex-col">
        <div
          aria-hidden="true"
          className="vertical-menu-title departments-menu-v2-title shrink-0 bg-brand-secondary"
          style={{
            borderRadius: 0,
            // Live: the yellow departments title bar is 241x48 (refs,
            // 2026-09-02). Padding alone rendered it 24px.
            height: 48,
            padding: '12px 20px',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        />

        <nav aria-label="קטגוריות" className="min-h-0 flex-1">
          <ul
            className="dropdown-menu yamm m-0 list-none p-0"
            style={{ borderWidth: 0, borderRadius: 0 }}
          >
            {KE_LIVE_CATEGORIES.map((cat) => {
              const href = cat.href ?? `/category/${cat.slug}`
              const isLast = cat.slug === lastSlug

              return (
                <li
                  key={cat.slug}
                  className={cat.highlight ? 'highlight' : undefined}
                  style={MENU_LI_STYLE}
                >
                  <Link
                    href={href}
                    className="block text-end transition-colors hover:bg-surface-hover hover:font-bold focus:bg-surface-hover focus:font-bold"
                    style={{
                      ...MENU_LINK_STYLE,
                      ...(isLast ? { borderBottom: 'none' } : {}),
                      ...(cat.highlight ? { fontWeight: 700 } : {}),
                    }}
                  >
                    {cat.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </aside>
  )
}
