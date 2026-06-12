'use client'

/**
 * 1:1 hero DOM from refs/ke_live_singlefile.html (initialized RevSlider + CSS).
 * Regenerate: node scripts/build-hero-from-singlefile.mjs
 */
import { initHeroExactRevSlider } from '@/lib/hero-exact-init'
import { HERO_EXACT_HTML } from '@/lib/hero-exact-html'
import '@/styles/hero-exact.css'
import { useEffect, useRef } from 'react'

export default function HeroExact() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    return initHeroExactRevSlider(root)
  }, [])

  return (
    <div
      ref={rootRef}
      className="ke-hero-exact-root elementor elementor-5202"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: HERO_EXACT_HTML }}
    />
  )
}
