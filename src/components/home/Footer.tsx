'use client'

import { Facebook, Instagram, Phone, Send, Share2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

const columns = [
  {
    title: 'ניווט מהיר',
    links: [
      { label: 'דילים חמים', href: '/deals' },
      { label: 'עד ₪99', href: '/under-99' },
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

export default function Footer() {
  return (
    <footer dir="rtl" className="w-full bg-[#333e48] text-white">
      <div className="max-w-[1430px] mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <Image
              src="/logo-white.png"
              alt="KenyonExpress"
              width={176}
              height={43}
              className="h-10 w-auto mb-6 brightness-0 invert"
            />
            <div className="flex items-start gap-3">
              <Phone className="w-12 h-12 text-[#fed700] flex-shrink-0" strokeWidth={1.5} />
              <div>
                <div className="text-[13px] text-white/80">יש שאלות? התקשרו 24/7</div>
                <a
                  href="tel:1800397777"
                  className="text-[20px] font-bold text-white hover:text-[#fed700] transition-colors"
                >
                  1-800-EXPRESS
                </a>
              </div>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-[16px] font-bold mb-5 pb-3 border-b border-white/15">
                {col.title}
              </h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[14px] text-white/70 hover:text-[#fed700] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="text-[16px] font-bold mb-5 pb-3 border-b border-white/15">פרטי קשר</h4>
            <p className="text-[14px] text-white/70 mb-2">תל אביב, ישראל</p>
            <a
              href="mailto:info@kenyonexpress.co.il"
              className="text-[14px] text-white/70 hover:text-[#fed700] transition-colors block mb-6"
            >
              info@kenyonexpress.co.il
            </a>
            <div className="flex gap-3">
              {[
                { Icon: Send, label: 'Telegram' },
                { Icon: Instagram, label: 'Instagram' },
                { Icon: Facebook, label: 'Facebook' },
                { Icon: Share2, label: 'שיתוף' },
              ].map(({ Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#fed700] hover:text-[#333e48] flex items-center justify-center transition-colors"
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
        <div className="max-w-[1430px] mx-auto px-4 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[13px] text-white/60">© קניון Express · כל הזכויות שמורות</p>
          <p className="text-[13px] text-white/60">ויזה · ביט · Visa · Mastercard · PayPal</p>
        </div>
      </div>
    </footer>
  )
}
