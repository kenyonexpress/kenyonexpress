'use client'

import { formatIls } from '@/lib/account/format'
import type { Agorot } from '@/lib/money'
import { signOut } from '@/server/actions/auth'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/account', label: 'סקירה' },
  { href: '/account/orders', label: 'ההזמנות שלי' },
  { href: '/account/coupons', label: 'הקופונים שלי' },
  { href: '/account/wallet', label: 'הארנק שלי' },
  { href: '/account/details', label: 'הפרטים שלי' },
  { href: '/account/addresses', label: 'כתובות' },
  { href: '/account/tokens', label: 'אמצעי תשלום' },
] as const

export default function AccountNav({
  fullName,
  email,
  avatarUrl,
  walletBalanceAgorot,
}: {
  fullName: string | null
  email: string
  avatarUrl: string | null
  walletBalanceAgorot: Agorot
}) {
  const pathname = usePathname()

  return (
    <nav className="account-nav" aria-label="ניווט באזור האישי">
      <div className="account-nav__head">
        <div className="account-nav__identity">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL
            <img
              className="account-nav__avatar"
              src={avatarUrl}
              alt=""
              width={40}
              height={40}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div>
            <p className="account-nav__name">{fullName || 'שלום'}</p>
            <p className="account-nav__email">{email}</p>
          </div>
        </div>
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
      <form action={signOut} className="account-nav__logout">
        <button type="submit" className="account-nav__logout-btn">
          התנתקות
        </button>
      </form>
    </nav>
  )
}
