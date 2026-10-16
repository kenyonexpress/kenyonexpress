'use client'

import { Grid3x3, Heart, Home, Search, User } from '@/components/icons'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'בית', icon: Home, id: 'home' },
  { href: '/products', label: 'קטגוריות', icon: Grid3x3, id: 'categories' },
  { href: '/search', label: 'חיפוש', icon: Search, id: 'search' },
  { href: '/wishlist', label: 'רשימת משאלות', icon: Heart, id: 'wishlist' },
  { href: '/account', label: 'חשבון', icon: User, id: 'account' },
]

export default function MobileNavBar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname === '/he'
    }
    return pathname.startsWith(href)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-40 safe-pb"
      data-mobile-nav
      aria-label="ניווט נייד"
    >
      <ul className="flex justify-around items-center h-14">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                className={`
                  flex flex-col items-center justify-center gap-1 py-2 px-1 h-14
                  transition-colors duration-200
                  ${active ? 'bg-yellow-400 text-gray-900' : 'text-gray-600 hover:text-gray-900'}
                `}
                aria-current={active ? 'page' : undefined}
                title={item.label}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
