'use client'

import { clubTierName } from '@/components/account/club-tier-name'
import { formatIls } from '@/lib/account/format'
import type { ClubTierId } from '@/lib/club/tiers'
import { t } from '@/lib/i18n/messages'
import type { Agorot } from '@/lib/money'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/account', label: t('account.overview') },
  { href: '/account/details', label: t('account.details') },
  { href: '/account/orders', label: t('account.orders') },
  { href: '/account/invoices', label: t('account.invoices') },
  { href: '/account/coupons', label: t('account.coupons') },
  { href: '/account/wishlist', label: t('account.wishlist') },
  { href: '/account/wallet', label: t('account.wallet') },
  { href: '/account/referrals', label: t('account.referrals') },
  { href: '/account/affiliate', label: t('account.affiliate') },
  { href: '/account/subscriptions', label: t('account.subscriptions') },
  { href: '/account/addresses', label: t('account.addresses') },
  { href: '/account/tokens', label: t('account.tokens') },
  { href: '/account/notifications', label: t('account.notifications') },
  { href: '/account/tickets', label: t('account.tickets') },
  { href: '/account/security', label: t('account.security') },
] as const

// This file carried its OWN copy of `formatIls`, a second
// `₪${value.toFixed(2)}` over a float, so the wallet badge in the nav and the
// wallet figure on the page were formatted by two different functions. One
// formatter, in format.ts, over integer agorot.
export default function AccountNav({
  fullName,
  email,
  walletBalanceAgorot,
  clubTier = null,
}: {
  fullName: string | null
  email: string
  walletBalanceAgorot: Agorot
  /** The customer's club tier (W07); null when the standing could not be read. */
  clubTier?: ClubTierId | null
}) {
  const pathname = usePathname()

  return (
    <nav className="account-nav" aria-label={t('account.navAriaLabel')}>
      <div className="account-nav__head">
        <p className="account-nav__name">{fullName || t('account.greeting')}</p>
        <p className="account-nav__email">{email}</p>
        {clubTier ? (
          <p className="account-nav__club">
            <span
              className="club-badge"
              data-tier={clubTier}
              aria-label={t('club.badge').replace('{tier}', clubTierName(clubTier))}
            >
              {clubTierName(clubTier)}
            </span>
          </p>
        ) : null}
      </div>
      <ul className="account-nav__list">
        {ITEMS.map((item) => {
          // /account itself must not light up for every child route.
          const isActive =
            item.href === '/account' ? pathname === '/account' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`account-nav__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.href === '/account/wallet' && (
                  <span className="account-nav__badge">{formatIls(walletBalanceAgorot)}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
