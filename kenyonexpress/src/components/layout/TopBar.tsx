import Link from 'next/link'
import { Lock, MapPin, Truck, User } from 'lucide-react'

/** refs/ke_live_singlefile.html — .top-bar.top-bar-v2 */
const TOPBAR = {
  backgroundColor: '#fff',
  borderBottom: '1px solid #ddd',
  height: '40px',
  fontSize: '0.929em',
  color: '#333e48',
  linkPadding: '0.58em 0',
  separatorColor: '#6e767d',
  separatorMargin: '0 1em',
  iconSize: 16,
  iconGap: '6px',
} as const

const TOPBAR_ITEMS = [
  { icon: MapPin, label: 'בפריסה ארצית' },
  { icon: Truck, label: 'משלוח מהיר חינם' },
  { icon: Lock, label: 'קניה בטוחה' },
] as const

function TopBarSeparator() {
  return (
    <span
      aria-hidden="true"
      style={{ color: TOPBAR.separatorColor, margin: TOPBAR.separatorMargin }}
    >
      |
    </span>
  )
}

export default function TopBar() {
  return (
    <div
      dir="rtl"
      className="w-full"
      style={{ backgroundColor: TOPBAR.backgroundColor, borderBottom: TOPBAR.borderBottom }}
    >
      <div
        className="mx-auto flex max-w-page items-center justify-between px-[0.9375rem]"
        style={{ height: TOPBAR.height, fontSize: '0.875rem', color: TOPBAR.color }}
      >
        <span style={{ fontSize: TOPBAR.fontSize, padding: TOPBAR.linkPadding }}>
          ברוך הבא לעולם של קניון Express
        </span>

        <nav className="flex items-center" aria-label="מידע שירות" style={{ fontSize: TOPBAR.fontSize }}>
          {TOPBAR_ITEMS.map((item, index) => (
            <span key={item.label} className="flex items-center">
              {index > 0 && <TopBarSeparator />}
              <span
                className="inline-flex items-center"
                style={{ padding: TOPBAR.linkPadding, gap: TOPBAR.iconGap }}
              >
                <item.icon size={TOPBAR.iconSize} strokeWidth={1.5} aria-hidden="true" />
                {item.label}
              </span>
            </span>
          ))}

          <TopBarSeparator />

          <Link
            href="/login"
            className="inline-flex items-center transition-opacity hover:opacity-80"
            style={{ padding: TOPBAR.linkPadding, gap: TOPBAR.iconGap, color: TOPBAR.color }}
          >
            <User size={TOPBAR.iconSize} strokeWidth={1.5} aria-hidden="true" />
            התחברות
          </Link>
        </nav>
      </div>
    </div>
  )
}
