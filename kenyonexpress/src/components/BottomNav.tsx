'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/profile', label: 'פרופיל', emoji: '👤' },
  { href: '/wallet',  label: 'ארנק',   emoji: '💳' },
  { href: '/coupons', label: 'קופונים', emoji: '🎟' },
  { href: '/products', label: 'קניות',  emoji: '🛒' },
  { href: '/',        label: 'בית',     emoji: '🏠' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 safe-area-inset-bottom">
      <div className="flex items-stretch justify-around max-w-2xl mx-auto">
        {tabs.map(({ href, label, emoji }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 py-2 text-xs font-medium transition-colors ${
                active ? 'text-brand' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className={`text-2xl leading-none mb-0.5 ${active ? 'opacity-100' : 'opacity-50'}`}>
                {emoji}
              </span>
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
