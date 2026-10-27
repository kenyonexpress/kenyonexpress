import { withRequestLog } from '@/lib/observability/with-request-log'
import { limitByIp } from '@/lib/rate-limit/route-guard'
import { createPublicClient } from '@/lib/supabase/public'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Mobile app endpoint for product details. Used by the deep-link product page
 * to fetch full product information from a notification link.
 */
async function handleGET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await limitByIp('mobile-product', 120, 300)
  if (limited) return limited

  const { slug } = await params

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const client = createPublicClient()
  const { data, error } = await client
    .from('products')
    .select('id, slug, name_he, description_he, price_agorot, image_url, supplier_id')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  return NextResponse.json(data, {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}

export const GET = withRequestLog('/api/mobile/products/[slug]', handleGET)
