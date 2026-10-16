'use client'

import { Grid3x3, Heart, Home, Search, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function MobileNavBar() {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'בית', icon: Home, testId: 'nav-home' },
    { href: '/category', label: 'קטגוריות', icon: Grid3x3, testId: 'nav-categories' },
    { href: '/search', label: 'חיפוש', icon: Search, testId: 'nav-search' },
    { href: '/account/wishlist', label: 'מועדפים', icon: Heart, testId: 'nav-wishlist' },
    { href: '/account', label: 'חשבון', icon: User, testId: 'nav-account' },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav
      data-mobile-nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around items-center h-14 z-40"
    >
      {navItems.map(({ href, label, icon: Icon, testId }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            data-testid={testId}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
              active ? 'bg-brand text-white' : 'text-foreground hover:bg-gray-50'
            }`}
          >
            <Icon size={24} />
            <span className="text-xs font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
