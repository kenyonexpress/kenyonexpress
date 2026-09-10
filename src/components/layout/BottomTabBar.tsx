import { t } from '@/lib/i18n/messages'
import Link from 'next/link'

/**
 * The phone's primary navigation, and the reason it is not just a nicer header.
 *
 * At 380px the header is a masthead, a category menu and a nav row. Reaching
 * any of it means scrolling back to the top of the page with the hand that is
 * holding the phone. This puts the five destinations that carry the whole
 * journey inside the thumb arc, on every route, at every scroll position.
 *
 * The five are home, categories, CART, wallet and account. The brief asked for
 * a search tab in the third slot; see that entry below for why this site cannot
 * have one and why linking to `/search` anyway would strand the visitor.
 *
 * IT IS `md:hidden`, NOT A RESPONSIVE VARIANT OF THE HEADER. From 768px up the
 * header is already reachable without scrolling and a bottom bar would be
 * chrome covering content for no gain.
 *
 * WHY THE SPACE IT OCCUPIES IS RESERVED IN CSS AND NOT HERE. `globals.css`
 * carries a `--reserve-*` variable per fixed bottom element and `body` sums
 * them, because `padding-bottom` only has one value and the consent banner and
 * the PWA prompt already fought over it once. This bar adds `--reserve-tabbar`
 * to that sum rather than introducing a second mechanism. Reserving in an
 * effect instead would move content after hydration, and this project holds CLS
 * at 0 on all three measured pages.
 *
 * WHY z-30, BELOW BOTH THINGS THAT MAY SIT ON TOP OF IT. The consent banner is
 * z-50 and the WhatsApp button is z-40. The banner is a legal gate that must
 * not be coverable, and it is dismissed once and then `display:none`; covering
 * navigation for that one interaction is correct. The WhatsApp button lifts
 * above this bar on phones rather than overlapping it - see `WhatsAppFloat`.
 *
 * EVERY TARGET CARRIES `min-h-11`, which is the 44px floor WCAG 2.5.5 and
 * Israeli standard 5568 both want, spelled the way the rest of this repo spells
 * it rather than as an arbitrary value the tokens gate rejects. A five-across
 * bar at 380px is where that floor is easiest to miss: the label is
 * `--text-micro`, so the padded anchor rather than the glyph is what the thumb
 * has to hit.
 */

type Tab = {
  href: string
  /**
   * A catalog key, not a string. `t` is a synchronous property lookup compiled
   * in at build time, so it is safe in a client component and cannot make this
   * page dynamic - see the header of `lib/i18n/messages.ts`.
   */
  label: string
  /** Matched as a prefix so `/account/orders` still lights the account tab. */
  match: (pathname: string) => boolean
  icon: React.ReactNode
}

/**
 * Exact for the home tab, prefix for the rest.
 *
 * `/` is a prefix of every path, so a prefix match there would light the home
 * tab on every page in the site and make the active state meaningless.
 */
const isHome = (pathname: string) => pathname === '/'
const startsWith =
  (...prefixes: string[]) =>
  (pathname: string) =>
    prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/**
 * Icons are inline SVG rather than an icon package: nothing else in this layout
 * pulls one in, and five glyphs are not worth a dependency on the critical path
 * of every mobile page. `aria-hidden` because the visible Hebrew label is the
 * accessible name; a screen reader announcing both would say everything twice.
 */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const TABS: Tab[] = [
  {
    href: '/',
    label: t('nav.tabbar.home'),
    match: isHome,
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" {...stroke}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    href: '/products',
    label: t('nav.tabbar.categories'),
    match: startsWith('/products', '/category'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" {...stroke}>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </svg>
    ),
  },
  {
    /**
     * THE CART, WHERE A SEARCH TAB WOULD OTHERWISE GO.
     *
     * The closeout brief names the five tabs as home / categories / search /
     * wallet / account. The third one cannot exist here, and shipping it was a
     * measured mistake this entry corrects.
     *
     * KenyonExpress has an ABSOLUTE PRODUCT RULE that the site carries no search
     * field: not in the masthead, not in the drawer, not on the results page.
     * `no-search-ui.test.ts` enforces it, and three search components were
     * deleted on 2026-09-04 to get there. `/search` survives only so a campaign
     * link or a redirect carrying `?q=` resolves.
     *
     * So a search tab does not fail the gate - it links, it does not type - it
     * fails the VISITOR. Tapping it with no query lands on a page whose empty
     * state reads "הקלידו לפחות 2 תווים כדי לחפש" above no input at all: an
     * instruction that cannot be followed. It is also `robots: index: false`,
     * because it is thin content by design.
     *
     * The cart is the honest fifth destination on a phone: it is the one screen
     * a shopper returns to repeatedly mid-journey, it is statically rendered,
     * and reaching it currently means scrolling back up to the masthead.
     */
    href: '/cart',
    label: t('nav.tabbar.cart'),
    match: startsWith('/cart'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" {...stroke}>
        <path d="M3 4h2.2l2.1 10.4a1.5 1.5 0 0 0 1.5 1.2h7.8a1.5 1.5 0 0 0 1.5-1.2L19.5 7H6" />
        <circle cx="9.5" cy="19" r="1.3" />
        <circle cx="17" cy="19" r="1.3" />
      </svg>
    ),
  },
  {
    href: '/account/wallet',
    label: t('nav.tabbar.wallet'),
    match: startsWith('/account/wallet', '/account/vouchers', '/account/my-vouchers'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" {...stroke}>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
        <path d="M16.5 12.5h1.5" />
      </svg>
    ),
  },
  {
    href: '/account',
    label: t('nav.tabbar.account'),
    // Deliberately last: the wallet tab claims its own sub-tree first, so an
    // exact-then-prefix order would light both. Array order is the tiebreak.
    match: startsWith('/account'),
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" {...stroke}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
]

/** The destinations, in bar order. Exported so a test can assert absences. */
export const TAB_HREFS: readonly string[] = TABS.map((tab) => tab.href)

/** The first tab that claims the path, so the wallet wins inside `/account`. */
export function activeTabHref(pathname: string): string | null {
  return TABS.find((tab) => tab.match(pathname))?.href ?? null
}

/**
 * The bar itself, with the active tab passed in rather than read.
 *
 * SERVER-RENDERABLE ON PURPOSE, and this is not a style preference. Reading
 * `usePathname()` inside the bar made it a client hook on the critical path of
 * every route in the store group, and under `cacheComponents` that is
 * `CLIENT_HOOK_DYNAMIC`: `pnpm build` refused to prerender `/gift/[token]` and
 * the build failed. The store layout's own docblock spends a paragraph on why
 * these routes must stay static, and a bottom bar is the last thing that should
 * cost that.
 *
 * So the shell prerenders with no tab lit, and `<BottomTabBarActive>` streams
 * the lit one in behind a Suspense boundary. There is no layout shift when it
 * arrives: the geometry is identical and the space is reserved in CSS by
 * `--reserve-tabbar` regardless of which variant is on screen. The only thing
 * that changes is which label is bold.
 */
export function BottomTabBarView({ active }: { active: string | null }) {
  return (
    <nav
      data-bottom-tab-bar=""
      aria-label={t('nav.tabbar.label')}
      className="fixed inset-inline-0 bottom-0 z-30 border-t border-border bg-white md:hidden"
      // The home indicator on a notched phone sits over the bar's lower edge.
      // Padding rather than height so the 44px targets are unaffected.
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const isActive = active === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  isActive ? 'font-bold text-heading' : 'text-muted'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default BottomTabBarView
