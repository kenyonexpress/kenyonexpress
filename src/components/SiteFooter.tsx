import CopyrightYear from '@/components/CopyrightYear'
import { AtSign, Music2, Send, Share2 } from '@/components/icons'

type FooterLink = { label: string; href: string }

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: 'אודות',
    links: [
      { label: 'מי אנחנו', href: '#' },
      { label: 'קריירה', href: '#' },
      { label: 'שותפים עסקיים', href: '#' },
      { label: 'צור קשר', href: '#' },
    ],
  },
  {
    title: 'שירות לקוחות',
    links: [
      { label: 'שאלות נפוצות', href: '#' },
      { label: 'מעקב הזמנה', href: '#' },
      { label: 'מדיניות החזרות', href: '#' },
      { label: 'מימוש קופונים', href: '#' },
    ],
  },
  {
    title: 'משפטי',
    links: [
      { label: 'תנאי שימוש', href: '#' },
      { label: 'מדיניות פרטיות', href: '#' },
      { label: 'מדיניות עוגיות', href: '#' },
      { label: 'נגישות', href: '#' },
    ],
  },
]

const socials: { label: string; href: string; Icon: typeof Share2 }[] = [
  { label: 'פייסבוק', href: '#', Icon: Share2 },
  { label: 'אינסטגרם', href: '#', Icon: AtSign },
  { label: 'טיקטוק', href: '#', Icon: Music2 },
  { label: 'ניוזלטר', href: '#', Icon: Send },
]

export default function SiteFooter() {
  return (
    <footer className="bg-footer-bg text-neutral-100 mt-space-2xl">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-2xl">
          {columns.map((col) => (
            <div key={col.title}>
              {/* h2, not h4. The only heading above this footer on /coupons is the
                  page's h1, so h4 skipped two levels and Lighthouse reported
                  heading-order there. The size is a class; the LEVEL is the
                  document outline a screen reader navigates by. */}
              <h2 className="text-neutral-50 font-bold mb-space-md text-sm">{col.title}</h2>
              <ul className="space-y-space-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-neutral-100 hover:text-brand transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Social */}
          <div>
            <h2 className="text-neutral-50 font-bold mb-space-md text-sm">עקבו אחרינו</h2>
            <div className="flex items-center gap-space-md">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-9 h-9 rounded-full bg-surface-hover hover:bg-brand flex items-center justify-center transition-colors"
                >
                  <Icon size={18} strokeWidth={1.8} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-space-2xl pt-space-lg text-center text-xs text-neutral-100">
          © <CopyrightYear /> קניון EXPRESS. כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  )
}
