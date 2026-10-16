import { getShopProductsCached, parseProductType } from '@/lib/category-page'
import { parseSort } from '@/lib/category-tokens'
import { loadGalleryAssetsForProducts } from '@/lib/images/gallery-assets'

function parsePrice(raw: string | null): number | undefined {
  if (!raw) return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parsePage(raw: string | null): number {
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const sort = parseSort(searchParams.get('sort') || undefined)
  const page = parsePage(searchParams.get('page'))
  const priceMin = parsePrice(searchParams.get('min'))
  const priceMax = parsePrice(searchParams.get('max'))
  const productType = parseProductType(searchParams.get('type') || undefined)

  const { items } = await getShopProductsCached({
    sort,
    page,
    priceMin,
    priceMax,
    productType,
  })

  // Load blur placeholders for all product images
  const assets = await loadGalleryAssetsForProducts(items)

  // Add assets to items for infinite scroll client
  const itemsWithAssets = items.map((item) => ({ ...item, assets }))

  return Response.json({ items: itemsWithAssets })
}
