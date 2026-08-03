'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

/**
 * Masthead search is `hidden` below `md`, so a phone Lighthouse run should not
 * pay for its client chunk at all ([32]). Load it only after we know the
 * viewport is desktop-wide; reserve the same h-11 slot with CSS so desktop
 * hydration does not collapse the masthead.
 */
const HeaderSearch = dynamic(() => import('@/components/search/HeaderSearch'), {
  ssr: false,
})

function SearchSlotReserve() {
  return (
    <div className="relative hidden min-w-0 flex-1 justify-center md:flex" aria-hidden="true">
      <div className="h-11 w-full max-w-md rounded-lg border-2 border-transparent" />
    </div>
  )
}

export default function DeferredHeaderSearch() {
  const [desktop, setDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  if (!desktop) return <SearchSlotReserve />
  return <HeaderSearch />
}
