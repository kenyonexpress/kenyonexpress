import { randomUUID } from 'node:crypto'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'
import '@/styles/checkout-page.css'

export const metadata: Metadata = {
  title: 'תשלום',
}

export default async function CheckoutPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Login happens from the cart CTA (Google). Direct anonymous visits go back.
  if (!user) redirect('/cart')

  const cart = await getCart()
  if (cart.items.length === 0) redirect('/cart')
  const validation = validateCartView(cart)

  const admin = createAdminClient()
  const [{ data: walletAccount }, { data: defaultAddress }] = await Promise.all([
    admin.from('wallet_accounts').select('balance_ils').eq('user_id', user.id).maybeSingle(),
    admin
      .from('user_addresses')
      .select('id, full_name, phone, city, street, street_number, apartment, zip')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const address: CheckoutAddressPrefill = {
    id: defaultAddress?.id ?? null,
    full_name: defaultAddress?.full_name ?? user.user_metadata?.full_name ?? '',
    phone: defaultAddress?.phone ?? '',
    city: defaultAddress?.city ?? '',
    street: defaultAddress?.street ?? '',
    street_number: defaultAddress?.street_number ?? '',
    apartment: defaultAddress?.apartment ?? '',
    zip: defaultAddress?.zip ?? '',
  }

  return (
    <div className="checkout-page">
      <h1 className="checkout-page__title">תשלום</h1>
      <CheckoutForm
        cart={cart}
        clientRef={randomUUID()}
        needsAddress={validation.requiresAddress}
        address={address}
        walletBalance={Number(walletAccount?.balance_ils ?? 0)}
      />
    </div>
  )
}
