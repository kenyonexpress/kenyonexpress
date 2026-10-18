import { createPublicClient } from '@/lib/supabase/anon'
import { cacheLife, cacheTag } from 'next/cache'

/**
 * Fetch active suppliers with logos for the Brands Row
 * Uses public anon key to fetch supplier data
 */
export async function getBrandsForRow() {
  'use cache'
  cacheTag('brands-row')
  cacheLife('hours')

  const supabase = createPublicClient()

  const { data } = await supabase
    .from('suppliers')
    .select('id, name, name_he, logo_url')
    .eq('is_active', true)
    .not('logo_url', 'is', null)
    .order('name_he', { ascending: true })
    .limit(20)

  return data ?? []
}
