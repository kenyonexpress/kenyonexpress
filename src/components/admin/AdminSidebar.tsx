'use client'

import { type AdminSection, canReadSection } from '@/lib/admin/permissions'
import type { AppRole } from '@/lib/admin/roles'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  BarChart3,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Flag,
  Hourglass,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Plus,
  Repeat,
  ScanLine,
  Search,
  Share2,
  ShieldAlert,
  ShoppingCart,
  Store,
  Tag,
  UserCheck,
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
    // `exact`, or the row lights up on /admin/products/images and /new too and
    // the sidebar stops saying where you are.
    exact: true,
  },
  // Its own entry rather than a button inside the products table: an operator
  // arrives here with a folder of files, not with a selection of rows.
  { href: '/admin/products/images', label: 'תמונות קבוצתי', icon: Package, section: 'catalog' },
  { href: '/admin/categories', label: 'קטגוריות', icon: Tag, section: 'catalog' },
  { href: '/admin/coupons', label: 'קופונים ודילים', icon: FileText, section: 'catalog' },
  { href: '/admin/coupons/lookup', label: 'איתור שובר', icon: ScanLine, section: 'catalog' },
  // Next to איתור שובר rather than under דוחות: the two are the same subject
  // seen at two zoom levels, and the operator who has just been asked to extend
  // one coupon is the one who should see how often that supplier's coupons die.
  { href: '/admin/coupons/expiry', label: 'תפוגת שוברים', icon: Hourglass, section: 'catalog' },
  { href: '/admin/approvals', label: 'תור אישורים', icon: BadgeCheck, section: 'catalog' },
  { href: '/admin/orders', label: 'הזמנות', icon: ShoppingCart, section: 'orders' },
  // `orders` and not `payments`: support has read on orders, and this console
  // is what that role exists for.
  { href: '/admin/support', label: 'פניות תמיכה', icon: LifeBuoy, section: 'orders' },
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
  {
    href: '/admin/suppliers/applications',
    label: 'בקשות הצטרפות',
    icon: BadgeCheck,
    section: 'suppliers',
  },
  // Contact-detail changes a supplier asked for. Its own entry rather than a
  // tab inside a supplier's page: it is a QUEUE, and a queue nobody passes on
  // the way to somewhere else is a queue that is never emptied.
  {
    href: '/admin/suppliers/contact-requests',
    label: 'בקשות עדכון פרטים',
    icon: BadgeCheck,
    section: 'suppliers',
  },
  { href: '/admin/vendors', label: 'ספקים (מערכת ישנה)', icon: Store, section: 'suppliers' },
  { href: '/admin/payments', label: 'תשלומים', icon: CreditCard, section: 'payments' },
  { href: '/admin/payouts', label: 'תשלומים לספקים', icon: Banknote, section: 'payments' },
  { href: '/admin/cashback', label: 'יומן קאשבק', icon: Coins, section: 'payments' },
  // Reads settlement_events, which is the journal that actually exists here.
  // Separate from תשלומים לספקים above, which reads payout_statements (081,
  // never applied to this database).
  { href: '/admin/reports', label: 'דוחות כספיים', icon: FileSpreadsheet, section: 'payments' },
  // `payments` and not `orders`: support reads orders, and this page names the
  // reasons an order was flagged and what we intend to argue in a chargeback.
  { href: '/admin/fraud', label: 'הונאה ומחלוקות', icon: ShieldAlert, section: 'payments' },
  { href: '/admin/affiliates', label: 'שותפים והפניות', icon: Share2, section: 'affiliates' },
  // `exact` because the entry below is nested under it, and the active rule is
  // `startsWith`: without this both rows light up on the snapshot page and the
  // sidebar stops saying where you are.
  {
    href: '/admin/analytics',
    label: 'אנליטיקה',
    icon: BarChart3,
    section: 'analytics',
    exact: true,
  },
  // The 170 snapshot tables, rebuilt nightly by pg_cron. Separate entry and not
  // a tab inside אנליטיקה because it answers a different question: that page
  // counts every order ever charged, this one excludes what was refunded, and
  // this is the only screen that shows returning customers at all.
  { href: '/admin/analytics/snapshot', label: 'דוחות לילה', icon: UserCheck, section: 'analytics' },
  { href: '/admin/search', label: 'חיפוש', icon: Search, section: 'analytics' },
  { href: '/admin/queues', label: 'תורים תקועים', icon: AlertTriangle, section: 'analytics' },
  // Reads job_runs, which the cron routes write themselves. The Actions run
  // records the call; this records the work.
  { href: '/admin/cron', label: 'משימות מתוזמנות', icon: Clock, section: 'analytics' },
  { href: '/admin/feature-flags', label: 'דגלי מערכת', icon: Flag, section: 'analytics' },
  { href: '/admin/pages', label: 'עמודי תוכן', icon: FileText, section: 'content' },
  { href: '/admin/homepage', label: 'עמוד הבית', icon: LayoutDashboard, section: 'content' },
  { href: '/admin/phases', label: 'שלבי מוצר', icon: Flag, section: 'catalog' },
  { href: '/admin/subscriptions', label: 'מנויים', icon: Repeat, section: 'payments' },
  { href: '/admin/audit-log', label: 'לוג פעילות', icon: ClipboardList, section: 'audit-log' },
]

export default function AdminSidebar({ role }: { role: AppRole }) {
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
