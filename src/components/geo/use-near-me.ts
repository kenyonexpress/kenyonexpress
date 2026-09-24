'use client'

import { type Coordinates, isValidCoordinates } from '@/lib/geo/distance'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

/**
 * Why the near-me tag did or did not get a position. Codes, not sentences: the
 * city row and the filter chip word these differently and read them from
 * different places, and the hook should not be where copy lives.
 */
export type NearMeError = 'unsupported' | 'invalid' | 'denied' | 'failed'

/**
 * The one implementation of "sort by where I am".
 *
 * GEOLOCATION IS ASKED FOR ON CLICK, NEVER ON MOUNT. A permission prompt that
 * appears because a page loaded is the prompt everybody denies, and a denial is
 * sticky per origin - one automatic prompt would poison the feature for that
 * customer permanently. The click is the consent, and `toggle` is the only
 * thing in this file that calls the browser.
 *
 * The coordinate never leaves the browser as a coordinate: it is resolved to a
 * `?near=lat,lng` query the server sorts by, rounded to four decimals (about
 * 11 m: enough to sort by, and not a precise record of where somebody is
 * standing). No coordinate is stored, logged, or attached to an account.
 *
 * Shared by `CityTags` (the row under the grid) and `NearMeChip` (the filter
 * row above it), so the two cannot disagree about what "near me" does or what
 * it asks the customer for.
 */
export function useNearMe() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<NearMeError | null>(null)

  const nearActive = searchParams.get('near') !== null

  function toggle() {
    if (nearActive) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('near')
      params.delete('page')
      const query = params.toString()
      router.push(query ? `${pathname}?${query}` : pathname)
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('unsupported')
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
          setError('invalid')
          return
        }
        const params = new URLSearchParams(searchParams.toString())
        params.delete('city')
        params.delete('page')
        params.set('near', `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
        router.push(`${pathname}?${params.toString()}`)
      },
      (positionError) => {
        setLocating(false)
        // Told apart on purpose: "you said no" is a different instruction to the
        // customer than "we could not get a fix".
        setError(positionError.code === positionError.PERMISSION_DENIED ? 'denied' : 'failed')
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  return { nearActive, locating, error, toggle }
}
