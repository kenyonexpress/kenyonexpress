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
        {/*
          THE YELLOW BAR HAD NO CONTENT IN IT, and shipped as an empty coloured
          box above the departments list.

          It was `aria-hidden` and self-closing: 48px of brand yellow with
          nothing inside. Live's markup is
          `<div class="vertical-menu-title departments-menu-v2-title"><span
          class="title">קטגוריות</span><a href=""></a></div>` -- the heading was
          simply never carried across, and the geometry was reproduced without
          it, so the box was right and empty.

          The empty `<a href="">` beside it on live is a WordPress theme artifact
          with no destination; it is not reproduced. `aria-hidden` is gone with
          the emptiness -- there is text to read now -- and the inner nav's
          duplicate `aria-label` went with it, because the aside already names
          the region and a screen reader was hearing "קטגוריות" three times.

          Type from live: `.vertical-menu-title{padding:12px 20px;font-weight:500}`
          and `.vertical-menu-title .title{font-weight:700}`. Height 48 measured
          on refs 2026-09-02; padding alone rendered it 24px.
        */}
        <div
          className="vertical-menu-title departments-menu-v2-title shrink-0 bg-brand-secondary text-brand-dark"
          style={{
            borderRadius: 0,
            height: 48,
            padding: '12px 20px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span className="title font-bold">קטגוריות</span>
        </div>

        <nav className="min-h-0 flex-1">
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
