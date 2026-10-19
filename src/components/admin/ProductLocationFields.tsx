'use client'

import { geocodeAddress } from '@/server/actions/admin/geocode'
import { useState } from 'react'

const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand'

/**
 * Where the business is. Shown for physical and at-the-business products only;
 * a digital coupon leaves all three empty. The search button fills the
 * coordinates from the typed address and never writes anything by itself.
 */
export default function ProductLocationFields({
  required,
  defaults,
}: {
  required: boolean
  defaults: { city: string | null; latitude: number | null; longitude: number | null }
}) {
  const [city, setCity] = useState(defaults.city ?? '')
  const [lat, setLat] = useState(defaults.latitude?.toString() ?? '')
  const [lng, setLng] = useState(defaults.longitude?.toString() ?? '')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function search() {
    setBusy(true)
    setNote(null)
    const res = await geocodeAddress(address || city)
    setBusy(false)
    if (!res.ok) return setNote(res.error)
    setLat(res.latitude.toFixed(6))
    setLng(res.longitude.toFixed(6))
    setNote(`נמצא: ${res.label}`)
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-gray-200 p-4">
      <legend className="px-1 text-sm font-semibold text-gray-800">מיקום בית העסק</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="mb-1 block text-sm font-medium text-gray-700">
            עיר{required ? ' *' : ''}
          </label>
          <input
            id="city"
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required={required}
            maxLength={60}
            className={INPUT}
          />
        </div>
        <div>
          <label
            htmlFor="location-address"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            כתובת מלאה לחיפוש
          </label>
          <input
            id="location-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
            placeholder="הרצל 5, חיפה"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="latitude" className="mb-1 block text-sm font-medium text-gray-700">
            קו רוחב (lat)
          </label>
          <input
            id="latitude"
            name="latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="longitude" className="mb-1 block text-sm font-medium text-gray-700">
            קו אורך (lng)
          </label>
          <input
            id="longitude"
            name="longitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            className={INPUT}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={search}
        disabled={busy}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
      >
        {busy ? 'מחפש...' : 'חפש כתובת'}
      </button>
      {note && <output className="block text-sm text-gray-700">{note}</output>}
    </fieldset>
  )
}
