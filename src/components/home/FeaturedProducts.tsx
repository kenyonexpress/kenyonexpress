import { getFeaturedProducts } from '@/lib/home-data'
import FeaturedProductsTabs from './FeaturedProductsTabs'

/** Featured products, tabbed. Section 4 of the home order. */
export default async function FeaturedProducts() {
  const products = await getFeaturedProducts()
  if (products.length === 0) return null

  return (
    <section dir="rtl" aria-label="מוצרים מומלצים" className="home-section mx-auto font-sans">
      <FeaturedProductsTabs products={products} />
    </section>
  )
}
