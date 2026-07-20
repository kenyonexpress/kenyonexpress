import CartNavLink from '@/components/cart/CartNavLink'
import { Heart, User } from 'lucide-react'
import Link from 'next/link'

const ICON = { size: 22, color: '#515151', strokeWidth: 1.8 } as const

export default function MastheadNav() {
  return (
    <nav className="flex shrink-0 items-center gap-5" aria-label="פעולות חשבון ועגלה">
      <Link
        href="/wishlist"
        aria-label="מועדפים"
        className="transition-opacity hover:opacity-70"
        style={{ color: ICON.color }}
      >
        <Heart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
      </Link>

      <Link
        href="/login"
        aria-label="החשבון שלי"
        className="transition-opacity hover:opacity-70"
        style={{ color: ICON.color }}
      >
        <User size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
      </Link>

      <CartNavLink />
    </nav>
  )
}
