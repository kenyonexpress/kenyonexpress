import Image from 'next/image'
import Link from 'next/link'
import { AtSign, Camera, Send, Share2 } from 'lucide-react'

const NAV_LINKS = [
  { label: 'דילים חמים', href: '/products' },
  { label: 'עד 99₪', href: '/category/under-99' },
  { label: 'אלקטרוניקה', href: '/category/electronics' },
  { label: 'מסעדות ובתי קפה', href: '/category/restaurants' },
  { label: 'יופי בריאות וטיפוח', href: '/category/beauty' },
]

const SERVICE_LINKS = [
  { label: 'החשבון שלי', href: '/profile' },
  { label: 'מעקב הזמנה', href: '/orders' },
  { label: 'החזרות', href: '/returns' },
  { label: 'שאלות נפוצות', href: '/faq' },
]

const SOCIALS = [
  { label: 'פייסבוק', href: '#', Icon: Share2 },
  { label: 'אינסטגרם', href: '#', Icon: Camera },
  { label: 'טלגרם', href: '#', Icon: Send },
  { label: 'אימייל', href: 'mailto:info@kenyonexpress.co.il', Icon: AtSign },
]

const PAYMENT_LABELS = ['Visa', 'Mastercard', 'Bit', 'PayPal'] as const

export default function SiteFooter() {
  return (
    <footer dir="rtl" className="w-full">

      <div className="bg-brand-secondary">
        <div className="max-w-screen-xl mx-auto px-4 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-start">
            <p className="font-black text-brand-dark text-base">הירשמו לניוזלטר</p>
            <p className="text-sm text-brand-dark/80 mt-0.5">
              וקבלו קופון ₪20 לקנייה הראשונה
            </p>
          </div>
          <form method="POST" action="/api/newsletter" className="flex gap-2 w-full md:w-auto max-w-md">
            <input
              type="email"
              name="email"
              placeholder="כתובת אימייל"
              aria-label="כתובת אימייל לניוזלטר"
              required
              className="flex-1 h-10 rounded-full px-4 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-brand-dark bg-white text-gray-900"
            />
            <button
              type="submit"
              className="h-10 px-6 rounded-full bg-brand-dark text-white text-sm font-bold hover:opacity-90 transition-opacity shrink-0"
            >
              הרשמה
            </button>
          </form>
        </div>
      </div>

      <div className="bg-gray-900 text-gray-300">
        <div className="max-w-screen-xl mx-auto px-4 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">

            <div>
              <Image
                src="/logo.png"
                alt="קניון EXPRESS"
                width={120}
                height={46}
                className="h-10 w-auto object-contain brightness-0 invert mb-4"
              />
              <p className="text-sm font-bold text-white">שירות לקוחות 24/7</p>
              <p className="text-lg font-black text-brand-secondary mt-1">1-800-EXPRESS</p>
              <p className="text-xs text-gray-500 mt-1">א׳–ה׳ 09:00–18:00</p>
            </div>

            <div>
              <h4 className="text-white font-bold text-sm mb-3">ניווט מהיר</h4>
              <ul className="space-y-2">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
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

            <div>
              <h4 className="text-white font-bold text-sm mb-3">שירות לקוחות</h4>
              <ul className="space-y-2">
                {SERVICE_LINKS.map((link) => (
                  <li key={link.href}>
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

            <div>
              <h4 className="text-white font-bold text-sm mb-3">פרטי קשר</h4>
              <p className="text-xs text-gray-400 mb-3">info@kenyonexpress.co.il</p>
              <div className="flex items-center gap-2">
                {SOCIALS.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    className="w-9 h-9 rounded-full bg-gray-800 hover:bg-brand-secondary hover:text-brand-dark text-gray-300 flex items-center justify-center transition-colors"
                  >
                    <Icon size={17} strokeWidth={1.8} />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              © קניון Express - כל הזכויות שמורות
            </p>
            <div className="flex items-center gap-3" aria-label="אמצעי תשלום">
              {PAYMENT_LABELS.map((label) => (
                <span
                  key={label}
                  className="text-[10px] font-bold uppercase tracking-wide text-gray-500 border border-gray-700 rounded px-2 py-1"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
