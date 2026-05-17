'use client'

import { useEffect, useState } from 'react'

const slides = [
  {
    id: 'welcome',
    headline: 'ברוכים הבאים לקניון Express',
    subtitle: 'מסדרים לך בילוי...',
  },
  {
    id: 'best',
    headline: 'SIMPLY THE BEST',
    subtitle: 'המוצרים הכי טובים במחירים הכי זולים',
  },
  {
    id: 'coupons',
    headline: 'קופונים ודילים',
    subtitle: 'חסוך עד 70% על כל קנייה',
  },
]

export default function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const slide = slides[activeIndex] ?? slides[0]!

  return (
    <section dir="rtl" className="w-full bg-white" style={{ minHeight: '400px' }}>
      <div className="flex flex-row items-stretch" style={{ minHeight: '400px' }}>
        {/* Right: text content */}
        <div className="flex flex-1 flex-col justify-center gap-4 px-8 py-10 md:px-16">
          <h1 className="text-4xl font-bold text-gray-800">{slide.headline}</h1>
          <p className="text-lg text-gray-500">{slide.subtitle}</p>
          <div>
            <button
              type="button"
              className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold px-8 py-3 rounded-full transition-colors"
            >
              לקניות ←
            </button>
          </div>
        </div>

        {/* Left: image placeholder */}
        <div className="hidden md:flex flex-1 items-center justify-center bg-gray-100">
          <span className="text-gray-400 text-lg">תמונה</span>
        </div>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 pb-4">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={`w-3 h-3 rounded-full transition-colors ${
              s.id === slide.id ? 'bg-yellow-400' : 'bg-gray-300'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
