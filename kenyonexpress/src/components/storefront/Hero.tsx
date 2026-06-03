'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const SLIDES = [
  {
    id: 'welcome',
    headline: 'ברוכים הבאים לקניון Express',
    sub: 'מסדרים לך בילוי',
    tag: 'SIMPLY THE BEST',
    cta: 'לקניות עכשיו',
    href: '/products',
    image: '/hero/slide1.jpg',
    bg: '#EAF4F6',
  },
  {
    id: 'electronics',
    headline: 'אלקטרוניקה בכל מחיר',
    sub: 'מחשבים, טלפונים ואוזניות',
    tag: 'BEST DEALS',
    cta: 'לכל האלקטרוניקה',
    href: '/category/electronics',
    image: '/hero/slide2.jpg',
    bg: '#F0F4FF',
  },
  {
    id: 'coupons',
    headline: 'קופונים ודילים חמים',
    sub: 'חסוך עד 70% על כל קנייה',
    tag: 'SAVE BIG',
    cta: 'לכל הקופונים',
    href: '/coupons',
    image: '/hero/slide3.jpg',
    bg: '#FFF8E1',
  },
]

const MINI_BANNERS = [
  {
    id: 'hottest',
    tagline: 'SHOP THE HOTTEST PRODUCTS',
    label: 'לקניות',
    href: '/products',
    image: '/banners/banner1.jpg',
  },
  {
    id: 'consoles',
    tagline: 'CATCH BIG DEALS ON THE CONSOLES',
    label: 'לקניות',
    href: '/products',
    image: '/banners/banner2.jpg',
  },
  {
    id: 'laptops',
    tagline: 'LAPTOPS NOTEBOOKS AND MORE',
    label: 'לקניות',
    href: '/category/electronics',
    image: '/banners/banner3.jpg',
  },
]

export default function Hero() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setActive((p) => (p + 1) % SLIDES.length), 4500)
    return () => clearInterval(t)
  }, [])

  const slide = SLIDES[active] ?? SLIDES[0]!

  return (
    <div className="flex flex-1 min-w-0">
      {/* Main carousel */}
      <div
        className="flex-1 overflow-hidden relative min-h-[460px] flex flex-col transition-colors duration-500"
        style={{ backgroundColor: slide.bg }}
      >
        <div className="flex flex-1 items-center px-8 py-6 gap-4" dir="rtl">
          {/* Text — right in RTL */}
          <div className="flex-1 space-y-3">
            <p className="text-xs font-bold tracking-[0.2em] text-gray-500 uppercase">
              {slide.tag}
            </p>
            <h1 className="text-3xl font-black text-gray-900 leading-tight">{slide.headline}</h1>
            <p className="text-base text-gray-600">{slide.sub}</p>
            <Link
              href={slide.href}
              className="inline-flex items-center gap-2 mt-2 bg-brand-primary text-brand-dark font-bold px-6 py-2.5 rounded-full hover:bg-brand-primary-hover transition-colors text-sm"
            >
              {slide.cta}
              <span aria-hidden="true" className="rtl:rotate-180">←</span>
            </Link>
          </div>

          {/* Image — left in RTL */}
          <div className="hidden sm:block w-[180px] h-[220px] shrink-0 overflow-hidden rounded-xl shadow-lg">
            <Image
              key={slide.id}
              src={slide.image}
              alt=""
              aria-hidden="true"
              width={180}
              height={220}
              className="w-full h-full object-cover"
              priority
            />
          </div>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`שקופית ${i + 1}`}
              className={`rounded-full transition-all duration-300 ${
                i === active
                  ? 'w-6 h-2.5 bg-brand-primary'
                  : 'w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Mini-banners — visual right side within the LTR wrapper */}
      <div className="hidden lg:flex flex-col w-[190px] shrink-0 border-s border-gray-200">
        {MINI_BANNERS.map((b) => (
          <Link
            key={b.id}
            href={b.href}
            className="group flex flex-col bg-white hover:border-brand-primary hover:shadow-md transition-all flex-1 border-b border-gray-200 last:border-b-0"
          >
            <div className="relative h-[110px] overflow-hidden bg-gray-50">
              <Image
                src={b.image}
                alt=""
                aria-hidden="true"
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="190px"
              />
            </div>
            <div className="p-3 flex flex-col gap-2" dir="rtl">
              <p className="text-[11px] font-bold uppercase leading-tight text-gray-700">
                {b.tagline}
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-brand-primary text-brand-dark px-3 py-1 rounded-full w-fit group-hover:bg-brand-primary-hover transition-colors">
                {b.label}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
