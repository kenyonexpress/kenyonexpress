'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { withActionContext } from '@/lib/observability/action-context'

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number; label: string }
  | { ok: false; error: string }

/**
 * Address to coordinates through OpenStreetMap Nominatim: free, no key. The
 * request leaves from the server so the browser CSP stays closed, and the
 * admin session is required so this is not an open proxy. Nominatim's policy
 * asks for an identifying User-Agent and at most one request per second; a
 * human pressing a button stays far under that.
 */
async function runGeocode(address: string): Promise<GeocodeResult> {
  await requireAdminSession()
  const q = address.trim()
  if (q.length < 4 || q.length > 200) return { ok: false, error: 'נא להקליד כתובת מלאה' }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=il&accept-language=he&q=${encodeURIComponent(q)}`
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'user-agent': 'KenyonExpress-admin/1.0 (kenyonexpress.co.il)' },
      timeoutMs: 8000,
    })
    if (!res.ok) return { ok: false, error: 'שירות החיפוש לא זמין, אפשר להזין קואורדינטות ידנית' }
    const rows = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[]
    const hit = rows[0]
    const latitude = Number(hit?.lat)
    const longitude = Number(hit?.lon)
    if (!hit || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: 'הכתובת לא נמצאה' }
    }
    return { ok: true, latitude, longitude, label: hit.display_name ?? q }
  } catch {
    return { ok: false, error: 'שירות החיפוש לא זמין, אפשר להזין קואורדינטות ידנית' }
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  return withActionContext('admin.product.geocode', () => runGeocode(address))
}
