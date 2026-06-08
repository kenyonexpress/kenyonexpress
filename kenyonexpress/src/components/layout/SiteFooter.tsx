import Link from 'next/link'
import { Camera, Headphones, Play, Send, Share2 } from 'lucide-react'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'

const NAV_LINKS = [
  { label: 'דילים חמים', href: '/products' },
  { label: 'עד 99₪', href: '/category/under-99' },
  { label: 'מסעדות ובתי קפה', href: '/category/restaurants' },
  { label: 'טלפונים ואלקטרוניקה', href: '/category/electronics' },
  { label: 'תינוקות וילדים', href: '/category/kids' },
  { label: 'צימרים ובתי מלון', href: '/category/hotels' },
  { label: 'בעלי מקצוע', href: '/category/pros' },
]

const SERVICE_LINKS = [
  { label: 'החשבון שלי', href: '/profile' },
  { label: 'מעקב הזמנה', href: '/orders' },
  { label: 'שירות לקוחות', href: '/support' },
  { label: 'החזרות והחלפות', href: '/returns' },
  { label: 'שאלות נפוצות', href: '/faq' },
]

// lucide 1.16 dropped brand icons (Facebook/Instagram/Youtube) — generic stand-ins
const SOCIALS = [
  { label: 'פייסבוק', href: '#', Icon: Share2 },
  { label: 'אינסטגרם', href: '#', Icon: Camera },
  { label: 'יוטיוב', href: '#', Icon: Play },
  { label: 'טלגרם', href: '#', Icon: Send },
]

const PAYMENT_LABELS = ['Visa', 'Mastercard', 'PayPal', 'ביט', 'אשראי'] as const

export default function SiteFooter() {
  return (
    <footer dir="rtl" className="w-full">
      {/* Newsletter bar */}
      <div className="bg-brand-secondary">
        <div className="max-w-[1320px] mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3 text-center md:text-start">
            <Send size={36} strokeWidth={1.5} className="text-brand-dark shrink-0" aria-hidden="true" />
            <p className="text-brand-dark">
              <span className="block text-lg font-black leading-tight">הירשמו לניוזלטר</span>
              <span className="block text-sm">...וקבלו קופון ₪20 לקנייה הראשונה</span>
            </p>
          </div>
          <form
            method="POST"
            action="/api/newsletter"
            className="flex w-full md:w-auto md:min-w-[440px] max-w-xl items-stretch gap-0 rounded-full overflow-hidden bg-white"
          >
            <input
              type="email"
              name="email"
              placeholder="הזינו את כתובת האימייל שלכם"
              aria-label="כתובת אימייל לניוזלטר"
              required
              className="flex-1 min-w-0 h-12 px-5 text-sm border-0 bg-white text-gray-900 focus:outline-none"
            />
            <button
              type="submit"
              className="h-12 px-7 bg-footer-bg text-white text-sm font-bold hover:opacity-90 transition-opacity shrink-0"
            >
              הרשמה
            </button>
          </form>
        </div>
      </div>

      {/* Footer body */}
      <div className="bg-footer-bg text-gray-300">
        <div className="max-w-[1320px] mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Col 1: logo + 24/7 phone */}
            <div>
              <SmartImage
                src={LOGO}
                alt="קניון EXPRESS"
                width={133}
                height={102}
                className="h-12 w-auto object-contain brightness-0 invert mb-4"
                fallbackClassName="h-12 w-16 rounded-md mb-4"
              />
              <div className="flex items-start gap-3">
                <Headphones
                  size={34}
                  strokeWidth={1.5}
                  className="text-brand-secondary shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm text-gray-400">יש שאלות? התקשרו 24/7!</p>
                  <p className="text-xl font-black text-white mt-0.5" dir="ltr">
                    1-800-EXPRESS
                  </p>
                </div>
              </div>
            </div>

            {/* Col 2: quick nav */}
            <div>
              <h4 className="text-white font-bold text-sm mb-3">ניווט מהיר</h4>
              <ul className="space-y-2">
                {NAV_LINKS.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-brand-secondary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3: customer service */}
            <div>
              <h4 className="text-white font-bold text-sm mb-3">שירות לקוחות</h4>
              <ul className="space-y-2">
                {SERVICE_LINKS.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-brand-secondary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4: contact */}
            <div>
              <h4 className="text-white font-bold text-sm mb-3">פרטי קשר</h4>
              <p className="text-sm text-gray-400">תל אביב, ישראל</p>
              <p className="text-sm text-gray-400 mb-4">info@kenyonexpress.co.il</p>
              <div className="flex items-center gap-2">
                {SOCIALS.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-secondary hover:text-brand-dark text-gray-300 flex items-center justify-center transition-colors"
                  >
                    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row (slightly darker) */}
        <div className="bg-black/20 border-t border-white/10">
          <div className="max-w-[1320px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* RTL: first child sits on the right */}
            <p className="text-xs text-gray-400" aria-label="אמצעי תשלום">
              {PAYMENT_LABELS.join(' · ')}
            </p>
            <p className="text-xs text-gray-400">© קניון Express - כל הזכויות שמורות</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
