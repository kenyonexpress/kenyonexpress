'use client'

import { Menu, Phone } from '@/components/icons'
import { storeWhatsAppNumber } from '@/lib/whatsapp'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'בית', href: '/' },
  { label: 'חנות', href: '/shop' },
  { label: 'מוצרים', href: '/products' },
  { label: 'דילים', href: '/deals' },
  { label: 'ספקים', href: '/suppliers' },
  { label: 'בלוג', href: '/blog' },
  { label: 'צור קשר', href: '/contact' },
  { label: 'חשבון', href: '/account' },
]

export default function NavBar() {
  const storePhone = storeWhatsAppNumber()

  return (
    <nav
      dir="rtl"
      className="sticky bottom-0 z-40 flex h-11 w-full items-center gap-4 bg-brand px-gutter xl:bottom-auto xl:top-[11rem]"
    >
      {/* Left side: Megamenu button */}
      <button
        type="button"
        className="flex shrink-0 items-center gap-2 rounded bg-surface px-4 py-2 font-medium text-brand transition-colors hover:bg-surface-hover"
        aria-label="הכל במבצע"
      >
        <Menu size={18} />
        <span>הכל במבצע</span>
      </button>

      {/* Center: Nav links (hidden on mobile) */}
      <div className="hidden flex-1 items-center justify-center gap-6 xl:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-heading transition-colors hover:text-heading-hover"
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Right side: Phone contact (hidden on mobile) */}
      {storePhone && (
        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <Phone size={18} />
          <a
            href={`tel:${storePhone}`}
            className="text-sm font-medium text-heading transition-colors hover:text-heading-hover"
          >
            דברו איתנו
          </a>
        </div>
      )}
    </nav>
  )
}
