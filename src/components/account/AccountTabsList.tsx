import { ACCOUNT_TABS, type AccountTabId } from '@/lib/account/tabs'
import Link from 'next/link'

/**
 * The five tab links (UX18), as markup: a nav of links with Hebrew labels,
 * the one whose id is `active` carrying `aria-current="page"`. No hook, no
 * read, so it renders on the server as the layout's Suspense fallback and
 * on the client inside `AccountTabs` with the path resolved.
 *
 * Route-based, not ARIA tabs: each link loads its own page, and a screen
 * reader told "tab 2 of 5, selected" on a link that navigates is being told
 * the wrong thing.
 */
export default function AccountTabsList({ active }: { active: AccountTabId | null }) {
  return (
    <nav className="account-tabbar" aria-label="אזורי החשבון">
      {ACCOUNT_TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="account-tabbar__link"
            aria-current={isActive ? 'page' : undefined}
            data-tab={tab.id}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
