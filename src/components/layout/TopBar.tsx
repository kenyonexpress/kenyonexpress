import LoginLink from '@/components/auth/LoginLink'
import dynamic from 'next/dynamic'

const ThemeToggle = dynamic(
  () => import('@/components/theme/ThemeToggle').then((m) => ({ default: m.ThemeToggle })),
  {
    ssr: false,
  },
)

const INFO_ITEMS = [
  { label: 'בפריסה ארצית' },
  { label: 'משלוח מהיר חינם' },
  { label: 'קניה בטוחה' },
  { label: 'התחברות', href: '/login' },
]

export default function TopBar() {
  return (
    <div className="topbar-container px-gutter">
      <div
        dir="rtl"
        className="flex h-11 items-center gap-0 text-topbar text-heading"
        data-testid="topbar"
      >
        <span className="topbar-greeting hidden">ברוך הבא לעולם של קניון Express</span>
        <div className="flex items-center gap-0">
          {INFO_ITEMS.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-0">
              {idx > 0 && (
                <span className="mx-[1em] text-border" aria-hidden="true">
                  |
                </span>
              )}
              {item.href ? (
                <LoginLink
                  href={item.href}
                  className="flex items-center gap-0 transition-colors hover:text-heading-hover"
                >
                  {item.label}
                </LoginLink>
              ) : (
                <span className="flex items-center gap-0">{item.label}</span>
              )}
            </div>
          ))}
        </div>
        <div className="me-touch-pad hidden xl:block">
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
