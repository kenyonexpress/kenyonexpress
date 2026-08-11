'use client'

import { HERO_CITIES } from '@/lib/geo/cities'
import { type Coordinates, isValidCoordinates } from '@/lib/geo/distance'
import { MapPin, Navigation } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

/**
 * The city row: five tags plus "קרוב אליי".
 *
 * The five cities are plain links, so they work without JavaScript, are
 * crawlable, and survive a shared URL. Only the near-me tag needs the browser,
 * and it is the only part that is interactive.
 *
 * GEOLOCATION IS ASKED FOR ON CLICK, NEVER ON MOUNT. A permission prompt that
 * appears because a page loaded is the prompt everybody denies, and a denial is
 * sticky per origin - one automatic prompt would poison the feature for that
 * customer permanently. The click is the consent.
 *
 * The coordinate never leaves the browser as a coordinate: it is resolved to a
 * `?near=lat,lng` query the server sorts by. No coordinate is stored, logged,
 * or attached to an account.
 */
export default function CityTags({ className = '' }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeCity = searchParams.get('city')
  const nearActive = searchParams.get('near') !== null

  function hrefForCity(slug: string): string {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('near')
    params.delete('page')
    if (params.get('city') === slug) params.delete('city')
    else params.set('city', slug)
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
  }

  function handleNearMe() {
    if (nearActive) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('near')
      params.delete('page')
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('הדפדפן הזה לא תומך באיתור מיקום')
      return
    }

    setLocating(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const point: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        // A device can report nonsense. Sorting the whole page by a coordinate
        // that is not a coordinate is worse than not sorting at all.
        if (!isValidCoordinates(point)) {
          setError('לא הצלחנו לקרוא את המיקום')
          return
        }
        const params = new URLSearchParams(searchParams.toString())
        params.delete('city')
        params.delete('page')
        // Four decimals is about 11 m: enough to sort by, and not a precise
        // record of where somebody is standing.
        params.set('near', `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
        router.push(`${pathname}?${params.toString()}`)
      },
      (positionError) => {
        setLocating(false)
        // Told apart on purpose: "you said no" is a different instruction to the
        // customer than "we could not get a fix".
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? 'אין הרשאת מיקום. אפשר לבחור עיר מהרשימה'
            : 'לא הצלחנו לאתר את המיקום. אפשר לבחור עיר מהרשימה',
        )
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
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
            onClick={handleNearMe}
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
      {error && <output className="mt-2 block text-center text-xs text-amber-700">{error}</output>}
    </div>
  )
}
