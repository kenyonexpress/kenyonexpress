'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

interface MegaMenuItem {
  label: string
  href: string
  featured?: boolean
  subcategories?: { label: string; href: string }[]
  promoText?: string
  promoSubtext?: string
}

const MEGAMENU_ITEMS: MegaMenuItem[] = [
  {
    label: 'דילים חמים 🔥',
    href: '/category/hot-deals',
    featured: true,
    promoText: 'עד 50% הנחה',
    promoSubtext: 'על המוצרים הנמכרים ביותר',
  },
  {
    label: 'עד ₪99',
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
              className={`px-3 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap ${
                openIndex === index
                  ? 'text-[color:var(--electro-text-primary)] bg-[color:var(--electro-surface-hover)]'
                  : 'text-[color:var(--electro-text-secondary)] hover:text-[color:var(--electro-text-primary)] hover:bg-[color:var(--electro-page)]'
              }`}
            >
              {item.label}
            </button>

            {openIndex === index && (
              <div
                id={`${panelIdPrefix}-${index}`}
                className="absolute top-full -left-6 mt-0 w-screen md:max-w-4xl bg-[var(--electro-yellow-primary)] shadow-xl z-50 p-8 rounded-b-lg"
                role="menu"
              >
                <div className="grid grid-cols-3 gap-8">
                  {/* Featured Image - Left Column */}
                  <div className="col-span-1">
                    <div className="bg-[color:var(--electro-white)] rounded-lg overflow-hidden aspect-square shadow-sm flex items-center justify-center">
                      <div className="text-center text-[color:var(--electro-icon-empty)]">
                        <div className="text-4xl mb-2">📦</div>
                        <span className="text-sm">{item.label}</span>
                      </div>
                    </div>
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
                          <ul className="space-y-2">
                            <li>
                              <Link
                                href={item.href}
                                className="text-[color:var(--electro-text-primary)] hover:text-[color:var(--electro-text-primary)] font-semibold text-sm"
                              >
                                כל {item.label}
                              </Link>
                            </li>
                            {item.subcategories.map((sub, subIndex) => (
                              <li key={`${sub.href}-${subIndex}`}>
                                <Link
                                  href={sub.href}
                                  className="text-[color:var(--electro-text-secondary)] hover:text-[color:var(--electro-text-primary)] hover:underline text-sm transition-colors"
                                >
                                  {sub.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[color:var(--electro-muted)] text-sm">
                            כל המוצרים בקטגוריה
                          </p>
                        )}
                      </div>

                      {/* Promo Banner */}
                      <div
                        className="bg-[color:var(--electro-info)] text-[color:var(--electro-white)] rounded-lg p-6 flex flex-col justify-center shadow-md"
                        role="complementary"
                      >
                        <p className="font-bold text-lg mb-2 leading-tight">{item.promoText}</p>
                        <p className="text-sm text-[color:var(--electro-info-light)]">
                          {item.promoSubtext}
                        </p>
                        <Link
                          href={item.href}
                          className="inline-flex items-center mt-4 text-[color:var(--electro-white)] font-medium hover:underline text-sm"
                        >
                          <span>לחצו כאן</span>
                          <span className="ms-2">→</span>
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
  )
}
