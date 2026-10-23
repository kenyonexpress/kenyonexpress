import GiftPurchaseForm from '@/components/gifts/GiftPurchaseForm'
import { createPublicClient } from '@/lib/supabase/anon'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ id: string }> }

export default async function GiftProductPage({ params }: Props) {
  const { id } = await params

  const supabase = createPublicClient()
  const { data: product } = await supabase
    .from('products')
    .select('id, name_he, kenyon_price, images, is_coupon_enabled, type')
    .eq('id', id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()

  if (!product) notFound()

  // Only coupons can be gifted
  if (product.type !== 'coupon' && !product.is_coupon_enabled) {
    notFound()
  }

  return (
    <div
      className="container"
      style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}
    >
      <h1 style={{ marginBottom: '1rem' }}>שלח מתנה</h1>
      <GiftPurchaseForm product={product} />
    </div>
  )
}
