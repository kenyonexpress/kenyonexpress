'use client'

import { formatIls } from '@/lib/account/format'
import type { Agorot } from '@/lib/money'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/account', label: 'סקירה' },
  { href: '/account/details', label: 'הפרטים שלי' },
  { href: '/account/orders', label: 'ההזמנות שלי' },
  { href: '/account/coupons', label: 'הקופונים שלי' },
  { href: '/account/wishlist', label: 'רשימת המשאלות' },
  { href: '/account/wallet', label: 'הארנק שלי' },
  { href: '/account/referrals', label: 'חבר מביא חבר' },
  { href: '/account/subscriptions', label: 'המנויים שלי' },
  { href: '/account/addresses', label: 'כתובות' },
  { href: '/account/tokens', label: 'אמצעי תשלום' },
  { href: '/account/security', label: 'אבטחה' },
] as const

// This file carried its OWN copy of `formatIls`, a second
// `₪${value.toFixed(2)}` over a float, so the wallet badge in the nav and the
// wallet figure on the page were formatted by two different functions. One
// formatter, in format.ts, over integer agorot.
export default function AccountNav({
  fullName,
  email,
  walletBalanceAgorot,
}: {
  fullName: string | null
  email: string
  walletBalanceAgorot: Agorot
}) {
  const pathname = usePathname()

  return (
    <nav className="account-nav" aria-label="ניווט באזור האישי">
      <div className="account-nav__head">
        <p className="account-nav__name">{fullName || 'שלום'}</p>
        <p className="account-nav__email">{email}</p>
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
