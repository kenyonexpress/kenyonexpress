'use client'

import { UNDER_99_LABEL } from '@/lib/ke-live-hero-data'
import { formatIsraeliPhoneDisplay, storeWhatsAppNumber } from '@/lib/whatsapp'
import { Phone, Send, Share2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

const columns = [
  {
    title: 'ניווט מהיר',
    links: [
      { label: 'דילים חמים', href: '/deals' },
      { label: UNDER_99_LABEL, href: '/under-99' },
      { label: 'מסעדות ובתי קפה', href: '/restaurants' },
      { label: 'טלפונים ואלקטרוניקה', href: '/electronics' },
      { label: 'תינוקות וילדים', href: '/kids' },
      { label: 'צימרים ובתי מלון', href: '/hotels' },
      { label: 'בעלי מקצוע', href: '/services' },
    ],
  },
  {
    title: 'שירות לקוחות',
    links: [
      { label: 'החשבון שלי', href: '/account' },
      { label: 'מעקב הזמנה', href: '/track' },
      { label: 'שירות לקוחות', href: '/support' },
      { label: 'החזרות והחלפות', href: '/returns' },
      { label: 'שאלות נפוצות', href: '/faq' },
    ],
  },
]

/**
 * THE PHONE NUMBER WAS A TEMPLATE PLACEHOLDER, AND IT DIALLED A STRANGER.
 *
 * This block read `href="tel:1800397777"` under the label `1-800-EXPRESS`, both
 * inherited from the Electro theme this layout was ported from. Three things
 * were measured on 2026-09-01 before changing it:
 *
 *   - `1800397777` appears exactly once in `src/` and nowhere in `refs/`.
 *   - It does not even match its own label: EXPRESS dials 397-7377.
 *   - The live site publishes ONE contact number, `972524635550`, and no
 *     1-800 number appears on it at all.
 *
 * So the digits belonged to nobody connected to this business, and a customer
 * pressing "call us 24/7" reached whoever owns that line. A wrong number is
 * worse than no number, because it fails silently on the customer's side.
 *
 * It now goes through `storeWhatsAppNumber()`, the same accessor the floating
 * button and the contact page use, so the shop has one number and
 * `NEXT_PUBLIC_WHATSAPP_PHONE` moves all of them at once. The block renders
 * nothing when that resolves to null, rather than printing a dead link.
 *
 * The "24/7" claim went with it: nothing substantiates it and it is a service
 * promise, not a layout detail.
 *
 * NOTE: this component is currently imported by nothing. The live footers are
 * `components/SiteFooter.tsx` and `components/layout/SiteFooter.tsx`, and
 * neither renders a `tel:` link, so the placeholder never reached production.
 * It is fixed rather than left because dead code carrying a plausible-looking
 * phone number is exactly what gets revived and shipped later.
 */
export default function Footer() {
  const storePhone = storeWhatsAppNumber()

  return (
    <footer dir="rtl" className="w-full bg-heading text-white">
      <div className="max-w-footer mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <Image
              src="/logo-white.png"
              alt="KenyonExpress"
              width={176}
              height={43}
              className="h-10 w-auto mb-6 brightness-0 invert"
            />
            {storePhone ? (
              <div className="flex items-start gap-3">
                <Phone className="w-12 h-12 text-brand-primary flex-shrink-0" strokeWidth={1.5} />
                <div>
                  <div className="text-footer-note text-white/80">יש שאלות? התקשרו</div>
                  <a
                    href={`tel:+${storePhone}`}
                    className="text-footer-phone font-bold text-white hover:text-brand-primary transition-colors"
                  >
                    {formatIsraeliPhoneDisplay(storePhone)}
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-footer-head font-bold mb-5 pb-3 border-b border-white/15">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-footer-link text-white/70 hover:text-brand-primary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="text-footer-head font-bold mb-5 pb-3 border-b border-white/15">
              פרטי קשר
            </h4>
            <p className="text-footer-link text-white/70 mb-2">תל אביב, ישראל</p>
            <a
              href="mailto:info@kenyonexpress.co.il"
              className="text-footer-link text-white/70 hover:text-brand-primary transition-colors block mb-6"
            >
              info@kenyonexpress.co.il
            </a>
            <div className="flex gap-3">
              {[
                { Icon: Send, label: 'Telegram' },
                { Icon: InstagramIcon, label: 'Instagram' },
                { Icon: FacebookIcon, label: 'Facebook' },
                { Icon: Share2, label: 'שיתוף' },
              ].map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-primary hover:text-heading flex items-center justify-center transition-colors"
                  aria-label={label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-footer mx-auto px-4 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-footer-note text-white/60">© קניון Express · כל הזכויות שמורות</p>
          <p className="text-footer-note text-white/60">ויזה · ביט · Visa · Mastercard · PayPal</p>
        </div>
      </div>
    </footer>
  )
}
