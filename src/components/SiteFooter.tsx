import CopyrightYear from '@/components/CopyrightYear'
import { FaFacebook, FaInstagram } from '@/components/icons/electro-icons'

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

const socials: { label: string; href: string; Icon: typeof FaFacebook }[] = [
  { label: 'פייסבוק', href: '#', Icon: FaFacebook },
  { label: 'אינסטגרם', href: '#', Icon: FaInstagram },
]

export default function SiteFooter() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-8">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {columns.map((col) => (
            <div key={col.title}>
              {/* h2, not h4. The only heading above this footer on /coupons is the
                  page's h1, so h4 skipped two levels and Lighthouse reported
                  heading-order there. The size is a class; the LEVEL is the
                  document outline a screen reader navigates by. */}
              <h2 className="text-white font-bold mb-3 text-sm">{col.title}</h2>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Social */}
          <div>
            <h2 className="text-white font-bold mb-3 text-sm">עקבו אחרינו</h2>
            <div className="flex items-center gap-3">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-9 h-9 rounded-full bg-gray-800 hover:bg-brand flex items-center justify-center transition-colors"
                >
                  <Icon size={18} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-4 text-center text-xs text-gray-400">
          © <CopyrightYear /> קניון EXPRESS. כל הזכויות שמורות.
        </div>
      </div>
    </footer>
  )
}
