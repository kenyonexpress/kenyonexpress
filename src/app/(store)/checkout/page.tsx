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

const EMPTY_ADDRESS: CheckoutAddressPrefill = {
  id: null,
  full_name: '',
  phone: '',
  city: '',
  street: '',
  street_number: '',
  apartment: '',
  floor: '',
  zip: '',
  email: '',
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // A guest reaches this page and fills it in. The account is required to pay,
  // not to shop: the sign-in happens on the pay button, and the guest cart is
  // merged into the account by /auth/callback on the way back. Sending an
  // anonymous visitor back to /cart, as this page used to, made the login the
  // first thing asked and the address the second.
  const cart = await getCart()
  if (cart.items.length === 0) redirect('/cart')
  const validation = validateCartView(cart)

  let address = EMPTY_ADDRESS
  let walletBalance = 0
  let savedCards: { id: string; last4: string | null; brand: string | null; isDefault: boolean }[] =
    []

  if (user) {
    const admin = createAdminClient()
    const [{ data: walletAccount }, { data: defaultAddress }, { data: tokens }] = await Promise.all(
      [
        // balance_agorot since 059. Selecting the old name failed with 42703, so
        // walletAccount came back null and every customer was shown a wallet
        // balance of zero: the money was there and could never be spent.
        admin
          .from('wallet_accounts')
          .select('balance_agorot')
          .eq('user_id', user.id)
          .maybeSingle(),
        admin
          .from('user_addresses')
          .select('id, full_name, phone, city, street, street_number, apartment, floor, zip')
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
      ],
    )

    address = {
      id: defaultAddress?.id ?? null,
      full_name: defaultAddress?.full_name ?? user.user_metadata?.full_name ?? '',
      phone: defaultAddress?.phone ?? '',
      city: defaultAddress?.city ?? '',
      street: defaultAddress?.street ?? '',
      street_number: defaultAddress?.street_number ?? '',
      apartment: defaultAddress?.apartment ?? '',
      floor: defaultAddress?.floor ?? '',
      zip: defaultAddress?.zip ?? '',
      email: user.email ?? '',
    }
    walletBalance = Number(walletAccount?.balance_agorot ?? 0) / 100
    savedCards = (tokens ?? [])
      // An expired card is still listed in /account so the customer can delete
      // it, but offering it here only buys a guaranteed decline.
      .filter((card) => !isCardTokenExpired(card.expiry_month, card.expiry_year, new Date()))
      .map((card) => ({
        id: card.id,
        last4: card.last_4,
        brand: card.card_brand,
        isDefault: card.is_default,
      }))
  }

  const { resume } = await searchParams

  return (
    <div className="checkout-page">
      <h1 className="checkout-page__title">קופה</h1>
      <CheckoutForm
        cart={cart}
        clientRef={randomUUID()}
        needsAddress={validation.requiresAddress}
        address={address}
        walletBalance={walletBalance}
        savedCards={savedCards}
        isAuthenticated={Boolean(user)}
        resuming={resume === '1'}
      />
    </div>
  )
}
