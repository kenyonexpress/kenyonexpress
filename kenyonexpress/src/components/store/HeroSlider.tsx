'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import SmartImage from '@/components/ui/SmartImage'

export type HeroSlide = {
  id: string
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_url: string | null
  label?: string | null
}

export default function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (slides.length <= 1) return
    const t = setInterval(() => setActive((p) => (p + 1) % slides.length), 5000)
    return () => clearInterval(t)
  }, [slides.length])

  if (slides.length === 0) return null

  return (
    <div className="relative flex flex-col h-full min-h-[440px] bg-brand-accent border-e border-gray-200 overflow-hidden">
      {/* Slides (crossfade) */}
      <div className="relative flex-1">
        {slides.map((slide, i) => {
          const href = slide.link_url ?? '/products'
          return (
            <div
              key={slide.id}
              aria-hidden={i !== active}
              className={`absolute inset-0 flex items-center gap-6 px-8 py-6 transition-opacity duration-700 ${
                i === active ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
                {slide.label && (
                  <span className="text-xs font-black tracking-widest text-brand-dark/70">
                    {slide.label}
                  </span>
                )}
                {slide.title && (
                  <h1 className="text-3xl md:text-4xl font-black text-brand-secondary leading-tight">
                    {slide.title}
                  </h1>
                )}
                {slide.subtitle && (
                  <p className="text-base font-bold text-gray-600">{slide.subtitle}</p>
                )}
                <Link
                  href={href}
                  className="inline-flex mt-4 w-fit items-center gap-2 rounded-full bg-brand-secondary px-6 py-2.5 text-sm font-bold text-brand-dark hover:opacity-90 transition-opacity"
                >
                  לקנייה
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>

              <div className="relative hidden sm:block w-[200px] h-[280px] shrink-0">
                <SmartImage
                  src={slide.image_url ?? ''}
                  alt=""
                  fill
                  sizes="200px"
                  className="object-contain drop-shadow-md"
                  fallbackClassName="absolute inset-0 rounded-lg"
                  iconSize={48}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Dots */}
      {slides.length > 1 && (
        <div className="relative flex items-center justify-center gap-2 py-3 bg-white/60 border-t border-gray-200/80">
          {slides.map((s, i) => (
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
      )}
    </div>
  )
}
