'use client'

import LoyaltyBadge from '@/components/account/LoyaltyBadge'
import { formatIls } from '@/lib/account/format'
import type { LoyaltyTier } from '@/lib/loyalty/tiers'
import type { Agorot } from '@/lib/money'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/account', label: 'סקירה' },
  { href: '/account/details', label: 'הפרטים שלי' },
  { href: '/account/orders', label: 'ההזמנות שלי' },
  { href: '/account/return', label: 'החזרות וביטולים' },
  { href: '/account/coupons', label: 'הקופונים שלי' },
  { href: '/wishlist', label: 'רשימת המשאלות' },
  { href: '/account/saved-searches', label: 'חיפושים שמורים' },
  { href: '/account/wallet', label: 'הארנק שלי' },
  { href: '/account/cashback', label: 'הקאשבק שלי' },
  { href: '/account/loyalty', label: 'מועדון הלקוחות' },
  { href: '/account/referrals', label: 'חבר מביא חבר' },
  { href: '/account/subscriptions', label: 'המנויים שלי' },
  { href: '/account/addresses', label: 'כתובות' },
  { href: '/account/tokens', label: 'אמצעי תשלום' },
  { href: '/account/notifications', label: 'התראות' },
  { href: '/account/security', label: 'אבטחה וכניסה' },
  { href: '/account/privacy', label: 'פרטיות ונתונים' },
] as const

// This file carried its OWN copy of `formatIls`, a second
// `₪${value.toFixed(2)}` over a float, so the wallet badge in the nav and the
// wallet figure on the page were formatted by two different functions. One
// formatter, in format.ts, over integer agorot.
export default function AccountNav({
  fullName,
  email,
  walletBalanceAgorot,
  loyaltyTier = null,
}: {
  fullName: string | null
  email: string
  walletBalanceAgorot: Agorot
  /** STEP 47: the live tier, shown as a chip under the name; null for none. */
  loyaltyTier?: LoyaltyTier | null
}) {
  const pathname = usePathname()

  return (
    <nav className="account-nav" aria-label="ניווט באזור האישי">
      <div className="account-nav__head">
        <p className="account-nav__name">{fullName || 'שלום'}</p>
        <p className="account-nav__email">{email}</p>
        {loyaltyTier && (
          <p className="account-nav__tier">
            <LoyaltyBadge tier={loyaltyTier} />
          </p>
        )}
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
