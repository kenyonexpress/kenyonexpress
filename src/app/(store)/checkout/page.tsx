import { randomUUID } from 'node:crypto'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { isCardTokenExpired } from '@/lib/payments/token-expiry'
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
  const [{ data: walletAccount }, { data: defaultAddress }, { data: savedCards }] =
    await Promise.all([
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
      admin
        .from('payment_tokens')
        .select('id, last_4, card_brand, expiry_month, expiry_year, is_default')
        .eq('profile_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
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
        savedCards={(savedCards ?? [])
          // An expired card is still listed in /account so the customer can
          // delete it, but offering it here only buys a guaranteed decline.
          .filter((card) => !isCardTokenExpired(card.expiry_month, card.expiry_year, new Date()))
          .map((card) => ({
            id: card.id,
            last4: card.last_4,
            brand: card.card_brand,
            isDefault: card.is_default,
          }))}
      />
    </div>
  )
}
