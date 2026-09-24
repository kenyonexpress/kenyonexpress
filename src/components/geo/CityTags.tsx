'use client'

import { HERO_CITIES } from '@/lib/geo/cities'
import { MapPin, Navigation } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { type NearMeError, useNearMe } from './use-near-me'

/**
 * The city row: five tags plus "קרוב אליי".
 *
 * The five cities are plain links, so they work without JavaScript, are
 * crawlable, and survive a shared URL. Only the near-me tag needs the browser,
 * and it is the only part that is interactive.
 *
 * The geolocation call itself lives in `useNearMe`, shared with the filter
 * chip above the grid: asked for on click and never on mount, resolved to a
 * `?near=lat,lng` query, never stored. See that file for the argument.
 */
const ERROR_TEXT: Record<NearMeError, string> = {
  unsupported: 'הדפדפן הזה לא תומך באיתור מיקום',
  invalid: 'לא הצלחנו לקרוא את המיקום',
  denied: 'אין הרשאת מיקום. אפשר לבחור עיר מהרשימה',
  failed: 'לא הצלחנו לאתר את המיקום. אפשר לבחור עיר מהרשימה',
}

export default function CityTags({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { nearActive, locating, error, toggle } = useNearMe()

  const activeCity = searchParams.get('city')

  function hrefForCity(slug: string): string {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('near')
    params.delete('page')
    if (params.get('city') === slug) params.delete('city')
    else params.set('city', slug)
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  return (
    <div className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-2" aria-label="סינון לפי עיר">
        {HERO_CITIES.map((city) => {
          const isActive = activeCity === city.slug
          return (
            <li key={city.slug}>
              <Link
                href={hrefForCity(city.slug)}
                aria-current={isActive ? 'true' : undefined}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'border-brand bg-brand text-brand-dark font-semibold'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-brand hover:text-brand-dark'
                }`}
              >
                <MapPin size={13} aria-hidden="true" />
                {city.name}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={toggle}
            disabled={locating}
            aria-pressed={nearActive}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${
              nearActive
                ? 'border-brand bg-brand text-brand-dark font-semibold'
                : 'border-gray-300 bg-white text-gray-700 hover:border-brand hover:text-brand-dark'
            }`}
          >
            <Navigation size={13} aria-hidden="true" />
            {locating ? 'מאתר...' : 'קרוב אליי'}
          </button>
        </li>
      </ul>
      {error && (
        <output className="mt-2 block text-center text-xs text-amber-700">
          {ERROR_TEXT[error]}
        </output>
      )}
    </div>
  )
}
