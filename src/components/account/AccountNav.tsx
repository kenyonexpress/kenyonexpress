'use client'

import LoyaltyBadge from '@/components/account/LoyaltyBadge'
import { formatIls } from '@/lib/account/format'
import type { LoyaltyTier } from '@/lib/loyalty/tiers'
import type { Agorot } from '@/lib/money'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/account', label: 'לוח בקרה', icon: 'home' },
  { href: '/account/orders', label: 'ההזמנות שלי', icon: 'box' },
  { href: '/account/wallet', label: 'ארנק וקאשבק', icon: 'wallet' },
  { href: '/account/coupons', label: 'הקופונים שלי', icon: 'ticket' },
  { href: '/account/addresses', label: 'כתובות משלוח', icon: 'map-pin' },
  { href: '/account/tokens', label: 'אמצעי תשלום', icon: 'credit-card' },
  { href: '/account/notifications', label: 'התראות', icon: 'bell' },
  { href: '/account/security', label: 'אבטחה', icon: 'lock' },
  { href: '/account/details', label: 'פרטים אישיים', icon: 'user' },
  { href: '/account/wishlist', label: 'מועדפים', icon: 'heart' },
  { href: '/account/loyalty', label: 'תוכנית חברים', icon: 'crown' },
  { href: '/account/referrals', label: 'הפניות של חברים', icon: 'gift' },
  { href: '/account/settings', label: 'הגדרות ויציאה', icon: 'settings' },
] as const

type IconType = (typeof ITEMS)[number]['icon']

const ICON_LABELS: Record<IconType, string> = {
  home: 'לוח בקרה',
  box: 'ההזמנות שלי',
  wallet: 'ארנק וקאשבק',
  ticket: 'הקופונים שלי',
  'map-pin': 'כתובות משלוח',
  'credit-card': 'אמצעי תשלום',
  bell: 'התראות',
  lock: 'אבטחה',
  user: 'פרטים אישיים',
  heart: 'מועדפים',
  crown: 'תוכנית חברים',
  gift: 'הפניות של חברים',
  settings: 'הגדרות ויציאה',
}

function IconComponent({ icon }: { icon: IconType }) {
  const iconMap: Record<IconType, React.ReactNode> = {
    home: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.home}</title>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    box: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.box}</title>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    wallet: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.wallet}</title>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <path d="M1 10h22" />
        <circle cx="17" cy="15" r="2" />
      </svg>
    ),
    ticket: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.ticket}</title>
        <path d="M2 4.5C2 3.12 3.12 2 4.5 2h15C20.88 2 22 3.12 22 4.5v3c-1.11 0-2 .9-2 2s.89 2 2 2v3c0 1.38-1.12 2.5-2.5 2.5h-15C3.12 15 2 13.88 2 12.5v-3c1.11 0 2-.9 2-2s-.89-2-2-2v-3z" />
      </svg>
    ),
    'map-pin': (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS['map-pin']}</title>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
    'credit-card': (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS['credit-card']}</title>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <path d="M1 10h22" />
        <path d="M4 15h4" />
      </svg>
    ),
    bell: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.bell}</title>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    lock: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.lock}</title>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        <circle cx="12" cy="16" r="1" />
      </svg>
    ),
    user: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.user}</title>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    heart: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.heart}</title>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    crown: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.crown}</title>
        <path d="M2 4h20v2l-2 4h2v2H2v-2h2l-2-4V4z" />
        <circle cx="12" cy="18" r="2" />
      </svg>
    ),
    gift: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.gift}</title>
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <polyline points="2 7 12 2 22 7" />
      </svg>
    ),
    settings: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <title>{ICON_LABELS.settings}</title>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" />
      </svg>
    ),
  }
  return <span className="account-nav__icon">{iconMap[icon]}</span>
}

export default function AccountNav({
  fullName,
  email,
  walletBalanceAgorot,
  loyaltyTier = null,
}: {
  fullName: string | null
  email: string
  walletBalanceAgorot: Agorot
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
          const isActive =
            item.href === '/account' ? pathname === '/account' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`account-nav__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <IconComponent icon={item.icon} />
                <span className="account-nav__label">{item.label}</span>
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
