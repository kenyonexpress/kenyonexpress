import { AtSign, Music2, Send, Share2 } from 'lucide-react'

const FOOTER_COLS = [
  {
    title: 'מצא במהירות',
    links: [
      { label: 'דף הבית', href: '/' },
      { label: 'כל המוצרים', href: '/products' },
      { label: 'קופונים ודילים', href: '/coupons' },
      { label: 'קטגוריות', href: '#' },
      { label: 'מבצעים מיוחדים', href: '#' },
    ],
  },
  {
    title: 'שירות לקוחות',
    links: [
      { label: 'שאלות נפוצות', href: '#' },
      { label: 'מעקב הזמנה', href: '#' },
      { label: 'מדיניות החזרות', href: '#' },
      { label: 'מימוש קופונים', href: '#' },
      { label: 'צור קשר', href: '#' },
    ],
  },
  {
    title: 'על החברה',
    links: [
      { label: 'מי אנחנו', href: '#' },
      { label: 'קריירה', href: '#' },
      { label: 'שותפים עסקיים', href: '#' },
      { label: 'תנאי שימוש', href: '#' },
      { label: 'מדיניות פרטיות', href: '#' },
    ],
  },
]

const SOCIALS = [
  { label: 'פייסבוק', Icon: Share2, href: '#' },
  { label: 'אינסטגרם', Icon: AtSign, href: '#' },
  { label: 'טיקטוק', Icon: Music2, href: '#' },
  { label: 'ניוזלטר', Icon: Send, href: '#' },
]

export default function StorefrontFooter() {
  return (
    <footer>
      {/* Newsletter strip */}
      <div className="bg-brand-primary">
        <div className="max-w-7xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-black text-brand-dark text-lg leading-tight">
              הרשמה לניוזלטר
            </p>
            <p className="text-brand-dark/70 text-sm">וקבל קופון ₪20 לקנייה הראשונה</p>
          </div>
          <form action="#" className="flex gap-2 w-full sm:w-auto">
            <input
              type="email"
              placeholder="כתובת מייל"
              aria-label="כתובת מייל לניוזלטר"
              className="flex-1 sm:w-64 h-10 rounded-lg border-0 bg-white px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-dark"
            />
            <button
              type="submit"
              className="h-10 px-5 bg-brand-dark text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors shrink-0"
            >
              הרשמה
            </button>
          </form>
        </div>
      </div>

      {/* Main footer */}
      <div className="bg-gray-900 text-gray-300">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-full bg-brand-primary text-brand-dark flex items-center justify-center font-black text-lg">
                  K
                </span>
                <div>
                  <p className="font-black text-white text-base leading-none">קניון EXPRESS</p>
                  <p className="text-[11px] text-gray-500">מסדרים לך בילוי</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                הפלטפורמה הישראלית לדילים, קופונים ומוצרים בפריסה ארצית.
              </p>
              <div>
                <p className="text-xs font-bold text-gray-500 mb-1">יש שאלות? התקשרו 24/7</p>
                <a
                  href="tel:+972501234567"
                  className="text-lg font-black text-white hover:text-brand-primary transition-colors"
                  dir="ltr"
                >
                  050-123-4567
                </a>
              </div>
              {/* Social icons */}
              <div className="flex items-center gap-2">
                {SOCIALS.map(({ label, Icon, href }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    className="w-8 h-8 rounded-full bg-gray-800 hover:bg-brand-primary hover:text-brand-dark flex items-center justify-center text-gray-400 transition-colors"
                  >
                    <Icon size={15} strokeWidth={1.8} />
                  </a>
                ))}
              </div>
            </div>

            {/* Link columns */}
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <h4 className="text-white font-bold mb-4 text-sm">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} קניון EXPRESS. כל הזכויות שמורות.
            </p>
            {/* Payment icons */}
            <div className="flex items-center gap-2">
              {['Visa', 'Mastercard', 'PayPal', 'Bit'].map((name) => (
                <span
                  key={name}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[10px] font-bold text-gray-400"
                  dir="ltr"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
