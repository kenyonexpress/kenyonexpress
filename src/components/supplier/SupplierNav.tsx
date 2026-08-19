'use client'

import { type SupplierMemberRole, hasMinRole } from '@/lib/supplier/roles'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS: Array<{
  href: string
  label: string
  minRole: SupplierMemberRole
}> = [
  { href: '/supplier', label: 'לוח בקרה', minRole: 'scanner' },
  { href: '/supplier/scan', label: 'סריקה', minRole: 'scanner' },
  { href: '/supplier/vouchers', label: 'הקופונים שלי', minRole: 'scanner' },
  { href: '/supplier/redemptions', label: 'מימושים', minRole: 'scanner' },
  // manager, not scanner: the catalogue view shows commission and margin, and
  // the scanner role exists so the till phone does not carry business terms.
  { href: '/supplier/products', label: 'המוצרים שלי', minRole: 'manager' },
  { href: '/supplier/payouts', label: 'תשלומים', minRole: 'owner' },
]

export default function SupplierNav({ memberRole }: { memberRole: SupplierMemberRole }) {
  const pathname = usePathname()

  return (
    <nav aria-label="ניווט ספק" className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 pb-2">
      {LINKS.filter((link) => hasMinRole(memberRole, link.minRole)).map((link) => {
        const active =
          link.href === '/supplier'
            ? pathname === '/supplier'
            : pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`min-h-11 shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              active
                ? 'bg-heading text-white'
                : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
