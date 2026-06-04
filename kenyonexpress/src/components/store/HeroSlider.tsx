'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, BadgePercent, MonitorSmartphone, ShoppingBag, type LucideIcon } from 'lucide-react'

type Slide = {
  id: string
  icon: LucideIcon
  href: string
}

const SLIDES: Slide[] = [
  { id: 'welcome', icon: ShoppingBag, href: '/products' },
  { id: 'slide-2', icon: BadgePercent, href: '/products' },
  { id: 'slide-3', icon: MonitorSmartphone, href: '/category/electronics' },
]

export default function HeroSlider() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setActive((p) => (p + 1) % SLIDES.length), 5000)
    return () => clearInterval(t)
  }, [])

  const slide = SLIDES[active] ?? SLIDES[0]!

  return (
    <div className="flex flex-col h-full min-h-[440px] bg-brand-accent border-e border-gray-200 overflow-hidden">
      <div className="flex flex-1 items-center gap-6 px-8 py-6">
        <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
          <h1 className="text-3xl md:text-4xl font-black text-gray-900 leading-tight">
            ברוכים הבאים לקניון Express
          </h1>
          <p className="text-base font-bold text-gray-600">מסדרים לך בילוי. . .</p>
          <p className="text-sm text-gray-500 tracking-widest uppercase mt-1">
            SIMPLY THE{' '}
            <span className="text-2xl font-black text-gray-900 normal-case tracking-normal">
              BEST
            </span>
          </p>
          <Link
            href={slide.href}
            className="inline-flex mt-4 w-fit items-center gap-2 rounded-full bg-brand-secondary px-6 py-2.5 text-sm font-bold text-brand-dark hover:opacity-90 transition-opacity"
          >
            לקניות
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <div className="hidden sm:flex w-[200px] h-[280px] shrink-0 items-center justify-center rounded-lg bg-white/60">
          <slide.icon key={slide.id} aria-hidden="true" className="h-16 w-16 text-gray-400" />
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 py-3 bg-white/60 border-t border-gray-200/80">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`שקופית ${i + 1}`}
            aria-current={i === active ? 'true' : undefined}
            className={`rounded-full transition-all duration-200 ${
              i === active
                ? 'w-7 h-2.5 bg-brand-secondary'
                : 'w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
