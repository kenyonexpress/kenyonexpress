'use client'

import { type AdminSection, canReadSection } from '@/lib/admin/permissions'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types/database'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Share2,
  ShoppingCart,
  Store,
  Tag,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  section: AdminSection
  exact?: boolean
  quickAdd?: string
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/admin/dashboard',
    label: 'לוח בקרה',
    icon: LayoutDashboard,
    section: 'dashboard',
    exact: true,
  },
  {
    href: '/admin/products',
    label: 'מוצרים',
    icon: Package,
    section: 'catalog',
    quickAdd: '/admin/products/new',
  },
  { href: '/admin/categories', label: 'קטגוריות', icon: Tag, section: 'catalog' },
  { href: '/admin/coupons', label: 'קופונים ודילים', icon: FileText, section: 'catalog' },
  { href: '/admin/approvals', label: 'תור אישורים', icon: BadgeCheck, section: 'catalog' },
  { href: '/admin/orders', label: 'הזמנות', icon: ShoppingCart, section: 'orders' },
  { href: '/admin/users', label: 'משתמשים', icon: Users, section: 'users' },
  {
    href: '/admin/suppliers',
    label: 'ספקים',
    icon: Store,
    section: 'suppliers',
    quickAdd: '/admin/suppliers/new',
  },
  // Legacy payout table. Separate from ספקים on purpose: nothing on the purchase
  // path references it (docs/ADMIN-ARCHITECTURE.md section 2).
  { href: '/admin/vendors', label: 'ספקים (מערכת ישנה)', icon: Store, section: 'suppliers' },
  { href: '/admin/payments', label: 'תשלומים', icon: CreditCard, section: 'payments' },
  { href: '/admin/payouts', label: 'תשלומים לספקים', icon: Banknote, section: 'payments' },
  // Reads settlement_events, which is the journal that actually exists here.
  // Separate from תשלומים לספקים above, which reads payout_statements (081,
  // never applied to this database).
  { href: '/admin/reports', label: 'דוחות כספיים', icon: FileSpreadsheet, section: 'payments' },
  { href: '/admin/affiliates', label: 'שותפים והפניות', icon: Share2, section: 'affiliates' },
  { href: '/admin/analytics', label: 'אנליטיקה', icon: BarChart3, section: 'analytics' },
  { href: '/admin/search', label: 'חיפוש', icon: Search, section: 'analytics' },
  { href: '/admin/queues', label: 'תורים תקועים', icon: AlertTriangle, section: 'analytics' },
  { href: '/admin/audit-log', label: 'לוג פעילות', icon: ClipboardList, section: 'audit-log' },
]

export default function AdminSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const visible = NAV_ITEMS.filter((item) => canReadSection(role, item.section))

  return (
    <aside className="w-56 shrink-0">
      <nav className="sticky top-4 overflow-hidden rounded-xl border border-black/10 bg-white">
        <div className="border-b border-gray-200 bg-brand-primary px-4 py-3">
          <span className="text-sm font-bold tracking-wide text-heading">פאנל ניהול</span>
        </div>
        <ul className="py-2">
          {visible.map(({ href, label, icon: Icon, exact, quickAdd }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <li key={href} className={quickAdd ? 'flex items-stretch' : undefined}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                    quickAdd && 'flex-1',
                    active
                      ? 'bg-brand-primary/40 text-heading'
                      : 'text-black/60 hover:bg-brand-primary/15 hover:text-heading',
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  {label}
                </Link>
                {quickAdd && (
                  <Link
                    href={quickAdd}
                    aria-label="מוצר חדש"
                    className="flex items-center px-2 text-black/40 transition-colors hover:bg-black/[0.03] hover:text-black"
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
