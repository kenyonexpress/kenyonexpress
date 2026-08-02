import ProductCard, { type Product } from '@/components/ProductCard'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type Props = {
  title: string
  categoryHref: string
  products: Product[]
}

export default function CategoryProductSection({ title, categoryHref, products }: Props) {
  if (products.length === 0) return null

  return (
    <section aria-label={title} className="max-w-page mx-auto px-4 pb-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
        <h2 className="text-section-title font-normal leading-snug text-heading">{title}</h2>
        <Link
          href={categoryHref}
          className="flex items-center gap-1 text-sm font-bold text-link hover:underline whitespace-nowrap"
        >
          הצג הכל
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 bg-gray-50 border border-gray-200 rounded-lg p-3">
        {products.slice(0, 4).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
