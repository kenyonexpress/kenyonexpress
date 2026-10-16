import { getCategoryBySlug, getCategoryProductsCached, parseProductType } from '@/lib/category-page'
import { parseSort } from '@/lib/category-tokens'
import { loadGalleryAssetsForProducts } from '@/lib/images/gallery-assets'
import { notFound } from 'next/navigation'

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

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)

  const category = await getCategoryBySlug(slug)
  if (!category) {
    notFound()
  }

  const sort = parseSort(searchParams.get('sort') || undefined)
  const page = parsePage(searchParams.get('page'))
  const priceMin = parsePrice(searchParams.get('min'))
  const priceMax = parsePrice(searchParams.get('max'))
  const productType = parseProductType(searchParams.get('type') || undefined)
  const supplierId = searchParams.get('supplier') || undefined
  const tag = searchParams.get('tag') || undefined

  const { items } = await getCategoryProductsCached({
    categoryId: category.id,
    category: { name_he: category.name_he, slug: category.slug },
    sort,
    page,
    priceMin,
    priceMax,
    productType,
    supplierId,
    tag,
  })

  // Load blur placeholders for all product images
  const assets = await loadGalleryAssetsForProducts(items)

  // Add assets to items for infinite scroll client
  const itemsWithAssets = items.map((item) => ({ ...item, assets }))

  return Response.json({ items: itemsWithAssets })
}
