import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const offset = Number.parseInt(searchParams.get('offset') || '0')
  const limit = Number.parseInt(searchParams.get('limit') || '24')

  const products = KE_LIVE_DEALS.slice(offset, offset + limit)

  return Response.json(products)
}
