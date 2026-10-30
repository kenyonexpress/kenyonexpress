import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Products whose `city` is exactly this city's name. One cached read, the same
 * hour of life as the category pages, the same tag so a catalogue edit
 * invalidates both. No coordinates, no distance: a city page is a filter by a
 * written value, nothing more.
 */
export const CITY_PAGE_LIMIT = 60

export async function getCityProducts(cityName: string) {
  'use cache'
  cacheLife('hours')
  cacheTag(CATALOGUE_TAG)

  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, slug, name_he, kenyon_price, full_price, images, stock_quantity, created_at, type, city, latitude, longitude, weekend_only, shipping_price_agorot, categories!products_category_id_fkey(name_he, slug), suppliers(city)',
    )
    .eq('city', cityName)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name_he', { ascending: true })
    .limit(CITY_PAGE_LIMIT)

  if (error) throw new Error(`city_page.read_failed: ${error.message}`)
  return data ?? []
}
