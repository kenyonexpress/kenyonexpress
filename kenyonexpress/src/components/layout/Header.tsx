'use client'

import { Heart, Menu, Search, ShoppingCart, User, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

type Props = {
  user: { email?: string } | null
}

const NAV_LINKS = [
  { href: '/products', label: 'מוצרים' },
  { href: '/coupons', label: 'קופונים' },
  { href: '/categories', label: 'קטגוריות' },
]

export default function Header({ user }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const accountHref = user ? '/profile' : '/login'

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo — first in DOM = rightmost in RTL */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0"
          aria-label="קניון אקספרס, לדף הבית"
        >
          <span className="w-10 h-10 rounded-full bg-brand-primary text-brand-dark flex items-center justify-center font-black text-lg">
            K
          </span>
          <span className="hidden sm:flex flex-col leading-tight">
            <span className="font-black text-lg text-gray-900 tracking-tight">קניון EXPRESS</span>
            <span className="text-[11px] text-gray-500">מסדרים לך בילוי</span>
          </span>
        </Link>

        {/* Search — center, hidden on mobile */}
        <form method="GET" action="/products" className="hidden md:flex flex-1 max-w-xl mx-auto">
          <div className="relative w-full">
            <Search
              size={18}
              className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              placeholder="חיפוש מוצרים, קופונים ועסקים..."
              aria-label="חיפוש"
              className="w-full h-10 rounded-lg border border-gray-300 bg-gray-50 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:bg-white transition-colors"
            />
          </div>
        </form>

        {/* Actions — last in DOM = leftmost in RTL */}
        <div className="flex items-center gap-1 shrink-0 mr-auto md:mr-0">
          <button
            type="button"
            className="hidden sm:inline-flex p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="רשימת משאלות"
          >
            <Heart size={22} strokeWidth={1.8} />
          </button>

          <button
            type="button"
            className="relative p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="עגלת קניות"
          >
            <ShoppingCart size={22} strokeWidth={1.8} />
            <span className="absolute top-1 left-1 text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center bg-brand-primary text-brand-dark">
              0
            </span>
          </button>

          <Link
            href={accountHref}
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label={user ? 'החשבון שלי' : 'התחברות'}
          >
            <User size={22} strokeWidth={1.8} />
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="תפריט"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-3">
          <form method="GET" action="/products">
            <div className="relative">
              <Search
                size={18}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                name="q"
                placeholder="חיפוש..."
                aria-label="חיפוש"
                className="w-full h-10 rounded-lg border border-gray-300 bg-gray-50 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:bg-white"
              />
            </div>
          </form>
          <nav className="flex flex-col" aria-label="ניווט ראשי">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-2.5 text-sm font-medium text-gray-700 hover:text-brand-primary border-b border-gray-100 last:border-0"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}
