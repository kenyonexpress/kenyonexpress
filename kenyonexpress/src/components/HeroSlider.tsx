'use client'

import { useState } from 'react'
import Link from 'next/link'

const slides = [
  {
    href: '/products',
    cta: 'לקניות',
    image: 'https://picsum.photos/seed/phone1/240/320',
  },
  {
    href: '/products',
    cta: 'לכל המבצעים',
    image: 'https://picsum.photos/seed/phone2/240/320',
  },
  {
    href: '/coupons',
    cta: 'לכל הקופונים',
    image: 'https://picsum.photos/seed/phone3/240/320',
  },
]

export default function HeroSlider() {
  const [active, setActive] = useState(0)
  const slide = slides[active]

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Slide — image RIGHT (first in RTL DOM), text LEFT (second in RTL DOM) */}
      <div className="flex items-center gap-6 px-8 py-8 min-h-[220px]" style={{ background: '#f8f8f8' }}>

        {/* Product image — visual RIGHT in RTL */}
        <div className="shrink-0 w-[140px] h-[200px] rounded-2xl overflow-hidden shadow-lg border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image}
            alt="מוצר"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Text — visual LEFT in RTL */}
        <div className="flex-1">
          <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">
            ברוכים הבאים לקניון Express
          </h2>
          <p className="text-base text-gray-500 mt-2">מסדרים לך בילוי...</p>
          <p className="mt-3 text-lg text-gray-700 font-light tracking-widest uppercase">
            Simply the{' '}
            <span className="font-black text-gray-900">BEST</span>
          </p>
          <Link
            href={slide.href}
            className="inline-block mt-5 text-gray-900 text-sm font-bold rounded-full px-6 py-2.5 hover:opacity-90 transition-opacity"
            style={{ background: '#F5C518' }}
          >
            {slide.cta} ←
          </Link>
        </div>
      </div>

      {/* Dot navigation */}
      <div className="flex items-center justify-center gap-2 py-3 bg-white border-t border-gray-100">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={i === active ? { background: '#F5C518' } : undefined}
            className={`rounded-full transition-all duration-200 ${
              i === active ? 'w-6 h-2.5' : 'w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400'
            }`}
            aria-label={`שקופית ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
