import { randomUUID } from 'node:crypto'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { isCardTokenExpired } from '@/lib/payments/token-expiry'
import { createAdminClient } from '@/lib/supabase/admin'
import { readWalletAccountAgorot } from '@/lib/supabase/optional-columns'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
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

/**
 * Everything on this page is the shopper: their cart, their address, their
 * saved cards, their wallet. The shell is the heading, and that is honest -
 * there is nothing else here that is the same for two people.
 *
 * It still buys the thing that was missing: the response starts immediately
 * instead of after `auth.getUser()`, `getCart()` and three admin queries.
 */
export default function CheckoutPage(props: { searchParams: Promise<{ resume?: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="checkout-page">
          <h1 className="checkout-page__title">קופה</h1>
        </div>
      }
    >
      <CheckoutPageBody {...props} />
    </Suspense>
  )
}

async function CheckoutPageBody({
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
    const [wallet, { data: defaultAddress }, { data: tokens }] = await Promise.all([
      // Probed rather than named. The comment that stood here said
      // `balance_agorot` was correct since 059 and that the old name had
      // failed with 42703; the hosted project never received 059, so it was
      // the new name that failed there, and the effect described was exactly
      // the one being caused: the money was there and could never be spent.
      readWalletAccountAgorot(
        (select, ids) =>
          admin.from('wallet_accounts').select(select).eq('user_id', ids[0]) as never,
        user.id,
      ),
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
    ])

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
    walletBalance = wallet.balanceAgorot / 100
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
