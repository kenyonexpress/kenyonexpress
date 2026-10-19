import { getBrandsForRow } from '@/lib/brands-row'
import { Suspense } from 'react'
import BrandsRow from './BrandsRow'

export default async function BrandsRowServer() {
  return (
    <Suspense fallback={null}>
      <BrandsRowContent />
    </Suspense>
  )
}

async function BrandsRowContent() {
  const brands = await getBrandsForRow()

  if (!brands || brands.length === 0) {
    return null
  }

  return <BrandsRow brands={brands} />
}
