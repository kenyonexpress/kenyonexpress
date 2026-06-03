'use client'

import { AlignJustify, Heart, MapPin, Menu, Search, ShoppingCart, User, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const REGIONS = ['כל הארץ', 'תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'נתניה', 'ראשון לציון']

const NAV_LINKS = [
  { label: 'בית', href: '/' },
  { label: 'אלקטרוניקה', href: '/category/electronics' },
  { label: 'קופונים', href: '/coupons' },
  { label: 'מוצרים', href: '/products' },
  { label: 'מסעדות', href: '#' },
  { label: 'יופי וטיפוח', href: '#' },
  { label: 'נסיעות', href: '#' },
]

export default function StorefrontHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [regionOpen, setRegionOpen] = useState(false)
  const [region, setRegion] = useState('כל הארץ')

  return (
    <header>
      {/* Top info bar */}
      <div className="bg-brand-dark text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between">
          <span className="hidden md:block text-gray-400">ברוך הבא לעולם של קניון Express</span>
          <div className="flex items-center gap-4 text-gray-400 ms-auto md:ms-0">
            <span className="hidden sm:block">בפריסה ארצית</span>
            <span className="h-3 w-px bg-gray-600 hidden sm:block" aria-hidden="true" />
            <span>משלוח מהיר חינם</span>
            <span className="h-3 w-px bg-gray-600" aria-hidden="true" />
            <span className="hidden md:block">קניה בטוחה</span>
            <span className="h-3 w-px bg-gray-600 hidden md:block" aria-hidden="true" />
            <Link href="/login" className="hover:text-white transition-colors">התחברות</Link>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="קניון אקספרס, לדף הבית">
            <span className="w-10 h-10 rounded-full bg-brand-primary text-brand-dark flex items-center justify-center font-black text-lg select-none">K</span>
            <span className="hidden sm:flex flex-col leading-tight">
              <span className="font-black text-lg text-gray-900 tracking-tight">קניון EXPRESS</span>
              <span className="text-[10px] text-gray-500 font-medium">מסדרים לך בילוי</span>
            </span>
          </Link>

          {/* Search */}
          <form method="GET" action="/products" className="hidden md:flex flex-1 max-w-lg mx-auto">
            <div className="relative w-full flex">
              <input
                type="search"
                name="q"
                placeholder="חיפוש מוצרים, קופונים ועסקים..."
                aria-label="חיפוש"
                className="w-full h-10 rounded-s-lg border border-gray-300 bg-gray-50 ps-4 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:bg-white transition-colors"
              />
              <button type="submit" className="h-10 px-5 bg-brand-primary text-brand-dark text-sm font-bold rounded-e-lg hover:bg-brand-primary-hover transition-colors shrink-0 flex items-center gap-1.5">
                <Search size={15} aria-hidden="true" />
                חיפוש
              </button>
            </div>
          </form>

          {/* Region */}
          <div className="relative hidden lg:block">
            <button type="button" onClick={() => setRegionOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-dark border border-gray-200 rounded-lg px-3 h-9 shrink-0 transition-colors">
              <MapPin size={14} aria-hidden="true" />{region}
            </button>
            {regionOpen && (
              <div className="absolute top-full start-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                {REGIONS.map((r) => (
                  <button key={r} type="button" onClick={() => { setRegion(r); setRegionOpen(false) }}
                    className={`w-full text-start px-4 py-2 text-sm hover:bg-brand-accent transition-colors ${r === region ? 'font-bold text-brand-dark' : 'text-gray-700'}`}>
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Icons */}
          <div className="flex items-center gap-0.5 shrink-0 ms-auto md:ms-0">
            <button type="button" className="hidden sm:inline-flex p-2.5 hover:bg-gray-100 rounded-full text-gray-700 transition-colors" aria-label="מועדפים">
              <Heart size={21} strokeWidth={1.8} />
            </button>
            <button type="button" className="relative p-2.5 hover:bg-gray-100 rounded-full text-gray-700 transition-colors" aria-label="עגלת קניות">
              <ShoppingCart size={21} strokeWidth={1.8} />
              <span className="absolute top-1 end-1 text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center bg-brand-primary text-brand-dark">0</span>
            </button>
            <Link href="/login" className="p-2.5 hover:bg-gray-100 rounded-full text-gray-700 transition-colors" aria-label="כניסה לחשבון">
              <User size={21} strokeWidth={1.8} />
            </Link>
            <button type="button" onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2.5 hover:bg-gray-100 rounded-full text-gray-700 transition-colors"
              aria-label="תפריט" aria-expanded={mobileOpen}>
              {mobileOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {/* Mobile search */}
        {mobileOpen && (
          <div className="md:hidden border-t border-gray-200 px-4 py-3">
            <form method="GET" action="/products">
              <div className="relative flex">
                <input type="search" name="q" placeholder="חיפוש..." aria-label="חיפוש"
                  className="flex-1 h-10 rounded-s-lg border border-gray-300 bg-gray-50 ps-4 pe-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
                <button type="submit" className="h-10 px-4 bg-brand-primary text-brand-dark text-sm font-bold rounded-e-lg">חיפוש</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Navigation bar — electro-style dark strip */}
      <nav className="bg-[#1d1d1d] text-white hidden md:block" aria-label="ניווט ראשי">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-10">
          {/* Departments button — first in DOM = right in RTL */}
          <div className="flex items-center shrink-0 h-full bg-brand-primary text-brand-dark px-4 gap-2 font-bold text-sm me-1">
            <AlignJustify size={16} aria-hidden="true" />
            מחלקות
          </div>
          {/* Quick nav links */}
          <div className="flex items-center gap-0">
            {NAV_LINKS.map((link) => (
              <Link key={link.href + link.label} href={link.href}
                className="px-3 h-10 flex items-center text-sm text-gray-300 hover:text-brand-primary hover:bg-white/5 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
