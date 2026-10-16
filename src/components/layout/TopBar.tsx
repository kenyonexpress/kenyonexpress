import LoginLink from '@/components/auth/LoginLink'
import { MapPin, ShoppingBag, User } from 'lucide-react'

const TOP_BAR_ITEMS: Array<{
  Icon: typeof User
  label: string
  href?: string
}> = [
  { Icon: MapPin, label: 'בפריסה ארצית' },
  { Icon: ShoppingBag, label: 'קניה בטוחה' },
  { Icon: User, label: 'התחברות / הרשמה', href: '/login' },
]

function TopBarItem({ Icon, label, href }: (typeof TOP_BAR_ITEMS)[number]) {
  const content = (
    <>
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
    </>
  )

  if (href) {
    return (
      <LoginLink
        href={href}
        className="flex items-center gap-1.5 transition-colors hover:text-heading-hover"
      >
        {content}
      </LoginLink>
    )
  }

  return <span className="flex items-center gap-1.5">{content}</span>
}

export default function TopBar() {
  return (
    <div
      dir="rtl"
      className="sticky top-0 z-50 flex h-11 w-full items-center justify-between gap-4 border-b border-border bg-[#f5f5f5] px-gutter text-sm text-heading"
      data-testid="new-topbar"
    >
      <span>ברוך הבא לעולמו של קניון Express - NEW TOPBAR</span>
      <div className="flex items-center gap-6">
        {TOP_BAR_ITEMS.map((item) => (
          <TopBarItem key={item.label} {...item} />
        ))}
      </div>
    </div>
  )
}
