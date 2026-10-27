'use client'

import { UNDER_99_LABEL } from '@/lib/ke-live-hero-data'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

interface MegaMenuItem {
  label: string
  href: string
  featured?: boolean
  subcategories?: { label: string; href: string }[]
  promoText?: string
  promoSubtext?: string
  brandLogos?: { name: string; src?: string }[]
  featuredImage?: string
}

const MEGAMENU_ITEMS: MegaMenuItem[] = [
  {
    label: 'דילים חמים 🔥',
    href: '/category/hot-deals',
    featured: true,
    promoText: 'עד 50% הנחה',
    promoSubtext: 'על המוצרים הנמכרים ביותר',
    brandLogos: [{ name: 'Apple' }, { name: 'Samsung' }, { name: 'Sony' }],
  },
  {
    // Digits then sign, isolated: the live string puts ₪ left of the digits in
    // RTL, and price-bidi.spec measures the glyph's x against the digit's.
    label: UNDER_99_LABEL,
    href: '/category/under-99',
    featured: true,
    promoText: 'מציאות',
    promoSubtext: 'בכל קטגוריה',
  },
  {
    label: 'החדשים',
    href: '/category/new',
    featured: true,
    promoText: 'זה בחנות!',
    promoSubtext: 'המוצרים החדשים ביותר',
  },
  {
    label: 'מסעדות ובתי קפה',
    href: '/category/restaurants-cafes',
    subcategories: [
      { label: 'כל המסעדות', href: '/category/restaurants-cafes' },
      { label: 'בתי קפה', href: '/category/restaurants-cafes' },
      { label: 'מסעדות זולות', href: '/category/restaurants-cafes' },
    ],
    promoText: 'ארוחות בהנחה',
    promoSubtext: 'בכמה קליקים בלבד',
  },
  {
    label: 'יופי בריאות וטיפוח',
    href: '/category/beauty-health',
    subcategories: [
      { label: 'קוסמטיקה וטיפול בעור', href: '/category/beauty-health' },
      { label: 'משקפיים שמש', href: '/category/beauty-health' },
      { label: 'טיפול בשיער', href: '/category/beauty-health' },
    ],
    promoText: 'ויוטאמינים וחומרי חיזוק',
    promoSubtext: 'תוספים טבעיים למבוגרים וילדים',
  },
  {
    label: 'טלפונים מחשבים ואביזרים',
    href: '/category/phones-computers',
    subcategories: [
      { label: 'סמארטפונים וטאבלטים', href: '/category/phones-computers' },
      { label: 'מחשבים נייחים ולפטופים', href: '/category/phones-computers' },
      { label: 'אביזרים וחיבורים', href: '/category/phones-computers' },
    ],
    promoText: 'טכנולוגיה חדישה',
    promoSubtext: 'במחיר הטוב בשוק',
  },
  {
    label: 'תינוקות וילדים',
    href: '/category/baby-kids',
    subcategories: [
      { label: 'כל הקטגוריה', href: '/category/baby-kids' },
      { label: 'ביגוד וחיתולים', href: '/category/baby-kids' },
      { label: 'צעצועים חינוכיים', href: '/category/baby-kids' },
    ],
    promoText: 'כל מה שצריך לתינוקות',
    promoSubtext: 'אצל מקצוענים',
  },
  {
    label: 'צימרים ובתי מלון',
    href: '/category/vacation',
    subcategories: [
      { label: 'צימרים לזוגות', href: '/category/vacation' },
      { label: 'בתי מלון משפחתיים', href: '/category/vacation' },
      { label: 'חופי ים ודברים', href: '/category/vacation' },
    ],
    promoText: 'בילוי משפחתי',
    promoSubtext: 'במקום לבדיקה',
  },
  {
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    subcategories: [
      { label: 'מזון לחיות מחמד', href: '/category/pets' },
      { label: 'צעצועים וכלים', href: '/category/pets' },
      { label: 'טיפול וטרינרי', href: '/category/pets' },
    ],
    promoText: 'טיפול בחיות המחמד',
    promoSubtext: 'בעלות שפירה',
  },
]

export default function MegaMenu() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelIdPrefix = useId()

  const closeMenu = useCallback(() => {
    setOpenIndex(null)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  const handleMouseEnter = useCallback((index: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenIndex(index)
    }, 100)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setOpenIndex(null)
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      if (event.key === 'Escape') {
        closeMenu()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const nextIndex = (index + 1) % MEGAMENU_ITEMS.length
        setOpenIndex(nextIndex)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const prevIndex = index === 0 ? MEGAMENU_ITEMS.length - 1 : index - 1
        setOpenIndex(prevIndex)
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setOpenIndex(index)
      }
    },
    [closeMenu],
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    if (openIndex !== null) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [openIndex, closeMenu])

  return (
    <>
      {/* Desktop Mega Menu (xl and up) */}
      <nav ref={menuRef} className="hidden xl:block flex-1" aria-label="תפריט קטגוריות ראשי">
        <div className="flex items-center gap-1">
          {MEGAMENU_ITEMS.map((item, index) => (
            <div
              key={`${item.href}-${index}`}
              className="relative"
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                onClick={() => {
                  if (openIndex === index) {
                    closeMenu()
                  } else {
                    setOpenIndex(index)
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, index)}
                aria-expanded={openIndex === index}
                aria-haspopup="true"
                aria-controls={openIndex === index ? `${panelIdPrefix}-${index}` : undefined}
                // px-2, NOT px-3. Twelve nowrap items at px-3 were about 50px
                // wider than the masthead's free width at 1440, and because the
                // icon cluster beside this row is shrink-0 the overflow went
                // there: probed 2026-10-20, the cart landed at x-46 and
                // document.scrollWidth read 1490 in a 1440 viewport, so every
                // desktop visitor could pan the page sideways and the parity
                // gate photographed a 1490px page. 24 x 4px = 96px back.
                className={`px-2 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap ease-out ${
                  openIndex === index
                    ? 'text-[color:var(--electro-text-primary)] bg-[color:var(--electro-surface-hover)] shadow-sm'
                    : 'text-[color:var(--electro-text-secondary)] hover:text-[color:var(--electro-text-primary)] hover:bg-[color:var(--electro-surface-hover)]'
                }`}
              >
                {item.label}
              </button>

              {openIndex === index && (
                <div
                  id={`${panelIdPrefix}-${index}`}
                  className="absolute top-full -start-6 mt-0 w-screen md:max-w-4xl bg-[var(--electro-yellow-primary)] shadow-xl z-50 p-8 rounded-b-lg animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none"
                  role="menu"
                >
                  <div className="grid grid-cols-3 gap-8">
                    {/* Featured Image - Left Column */}
                    <div className="col-span-1 animate-in fade-in slide-in-from-left-4 duration-300 motion-reduce:animate-none">
                      <div className="bg-gradient-to-br from-[color:var(--electro-page)] to-[color:var(--electro-surface-hover)] rounded-lg overflow-hidden aspect-square shadow-sm flex flex-col items-center justify-between p-4 transition-transform duration-300">
                        {item.featuredImage ? (
                          <Image
                            src={item.featuredImage}
                            alt={item.label}
                            fill
                            sizes="(max-width: 768px) 200px, 300px"
                            className="w-full h-full object-cover transition-transform duration-300"
                          />
                        ) : (
                          <>
                            <div className="text-4xl animate-in zoom-in duration-300 motion-reduce:animate-none">
                              📦
                            </div>
                            <span className="text-xs text-[color:var(--electro-muted)] text-center">
                              {item.label}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Brand Logos */}
                      {item.brandLogos && item.brandLogos.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2 animate-in fade-in delay-100 duration-300 motion-reduce:animate-none">
                          {item.brandLogos.map((brand, brandIndex) => (
                            <div
                              key={`${brand.name}-${brandIndex}`}
                              className="bg-[color:var(--electro-white)] rounded p-2 flex items-center justify-center min-h-10 text-xs text-[color:var(--electro-text-secondary)]"
                            >
                              {brand.src ? (
                                <Image
                                  src={brand.src}
                                  alt={brand.name}
                                  width={100}
                                  height={40}
                                  sizes="40px"
                                  className="max-h-full max-w-full object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-center text-[0.7em] font-medium">
                                  {brand.name}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Subcategories & Promo - Right Columns */}
                    <div className="col-span-2">
                      <div className="grid grid-cols-2 gap-8">
                        {/* Subcategories Column */}
                        <div>
                          <h3 className="font-bold text-base mb-4 text-[color:var(--electro-text-primary)] flex items-center gap-2">
                            {item.label}
                          </h3>
                          {item.subcategories && item.subcategories.length > 0 ? (
                            <ul className="space-y-2 animate-in fade-in slide-in-from-left-2 duration-300 motion-reduce:animate-none">
                              <li>
                                <Link
                                  href={item.href}
                                  className="text-[color:var(--electro-text-primary)] hover:text-[color:var(--electro-text-primary)] font-semibold text-sm transition-colors duration-200"
                                >
                                  כל {item.label}
                                </Link>
                              </li>
                              {item.subcategories.map((sub, subIndex) => (
                                <li key={`${sub.href}-${subIndex}`}>
                                  <Link
                                    href={sub.href}
                                    className="text-[color:var(--electro-text-secondary)] hover:text-[color:var(--electro-text-primary)] hover:underline text-sm transition-colors duration-200"
                                  >
                                    {sub.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[color:var(--electro-muted)] text-sm animate-in fade-in duration-300 motion-reduce:animate-none">
                              כל המוצרים בקטגוריה
                            </p>
                          )}
                        </div>

                        {/* Promo Banner */}
                        <div
                          className="bg-[color:var(--electro-info)] text-[color:var(--electro-white)] rounded-lg p-6 flex flex-col justify-center shadow-md animate-in fade-in slide-in-from-right-2 duration-300 motion-reduce:animate-none"
                          role="complementary"
                        >
                          <p className="font-bold text-lg mb-2 leading-tight">{item.promoText}</p>
                          <p className="text-sm text-[color:var(--electro-info-light)]">
                            {item.promoSubtext}
                          </p>
                          <Link
                            href={item.href}
                            className="inline-flex items-center mt-4 text-[color:var(--electro-white)] font-medium hover:underline text-sm transition-all duration-200"
                          >
                            <span>לחצו כאן</span>
                            <span
                              className="ms-2 transition-transform duration-200 group-hover:-translate-x-1"
                              aria-hidden="true"
                            >
                              ←
                            </span>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile Accordion (below xl) */}
      <div className="xl:hidden flex-1">
        <div className="px-3 py-2">
          <details className="group cursor-pointer">
            <summary className="flex items-center justify-between text-sm font-medium text-[color:var(--electro-text-primary)] list-none">
              <span>קטגוריות</span>
              <svg
                className="w-5 h-5 transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <title>הרחבת תפריט קטגוריות</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            </summary>
            <div className="mt-2 space-y-2 bg-[color:var(--electro-surface-hover)] rounded p-3">
              {MEGAMENU_ITEMS.map((item, index) => (
                <details
                  key={`${item.href}-${index}`}
                  className="group border-b border-[color:var(--electro-border)] last:border-0 pb-2 last:pb-0"
                >
                  <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-[color:var(--electro-text-primary)] list-none">
                    <Link
                      href={item.href}
                      className="flex-1 hover:text-[color:var(--electro-link)]"
                    >
                      {item.label}
                    </Link>
                    {item.subcategories && item.subcategories.length > 0 && (
                      <svg
                        className="w-4 h-4 transition-transform group-open:rotate-180 ms-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <title>הרחבת קטגוריית משנה</title>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                    )}
                  </summary>
                  {item.subcategories && item.subcategories.length > 0 && (
                    <div className="mt-2 ms-3 space-y-1 text-xs">
                      {item.subcategories.map((sub, subIndex) => (
                        <Link
                          key={`${sub.href}-${subIndex}`}
                          href={sub.href}
                          className="block text-[color:var(--electro-text-secondary)] hover:text-[color:var(--electro-link)]"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </details>
              ))}
            </div>
          </details>
        </div>
      </div>
    </>
  )
}
