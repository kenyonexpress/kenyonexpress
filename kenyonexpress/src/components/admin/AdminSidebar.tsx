'use client'

import { cn } from '@/lib/utils'
import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'לוח בקרה', icon: LayoutDashboard, exact: true },
  { href: '/admin/products', label: 'מוצרים', icon: Package, quickAdd: '/admin/products/new' },
  { href: '/admin/categories', label: 'קטגוריות', icon: Tag },
  { href: '/admin/vendors', label: 'ספקים', icon: Store },
  { href: '/admin/orders', label: 'הזמנות', icon: ShoppingCart },
  { href: '/admin/coupons', label: 'קופונים', icon: FileText },
  { href: '/admin/users', label: 'משתמשים', icon: Users },
  { href: '/admin/audit-log', label: 'לוג פעילות', icon: ClipboardList },
]

export default function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0">
      <nav className="sticky top-4 overflow-hidden rounded-xl border border-black/10 bg-[#FFFFFF]">
        <div className="border-b border-gray-200 bg-[#fed700] px-4 py-3">
          <span className="text-sm font-bold tracking-wide text-[#333e48]">פאנל ניהול</span>
        </div>
        <ul className="py-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact, quickAdd }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <li key={href} className={quickAdd ? 'flex items-stretch' : undefined}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                    quickAdd && 'flex-1',
                    active
                      ? 'bg-[#fed700]/40 text-[#333e48]'
                      : 'text-black/60 hover:bg-[#fed700]/15 hover:text-[#333e48]',
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  {label}
                </Link>
                {quickAdd && (
                  <Link
                    href={quickAdd}
                    aria-label="מוצר חדש"
                    className="flex items-center px-2 text-black/40 transition-colors hover:bg-black/[0.03] hover:text-[#000000]"
                  >
                    <Plus size={13} />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
