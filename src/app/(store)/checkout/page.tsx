import { randomUUID } from 'node:crypto'
import { validateCartView } from '@/lib/checkout/validate-cart'
import { isCardTokenExpired } from '@/lib/payments/token-expiry'
import { createAdminClient } from '@/lib/supabase/admin'
import { readWalletAccountAgorot } from '@/lib/supabase/optional-columns'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import CheckoutForm, { type CheckoutAddressPrefill } from './CheckoutForm'
import { CheckoutShell } from './CheckoutShell'
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
/**
 * Live names this route in a breadcrumb above the heading, the cart already
 * carries the same one, and checkout was the only page of the funnel without
 * it. Measured on the live /checkout/: `nav.woocommerce-breadcrumb` occupies
 * y165..236 and the `h1` starts at 237, which is 71px this page did not spend.
 *
 * That 71px is the whole of the residual the pixel gate was reading. Ours put
 * the `h1` at 172 against live's 237 and the yellow login strip at 268 against
 * live's 335, and `scripts/_offset-scan.mjs` found a single clean minimum at
 * exactly 67px: sliding the entire page down by that much took the diff from
 * 12.43% to 9.48%. One offset, not four steps' worth of structure.
 *
 * It is rendered in the Suspense shell as well as the body ON PURPOSE. The
 * shell paints the heading before the cart, the address and the saved cards
 * are read; a breadcrumb that arrived with the body would drop the `h1` 71px
 * after first paint, which is the exact shape of the /coupons regression that
 * scored CLS 0.585.
 */
function CheckoutBreadcrumb() {
  return (
    <nav className="checkout-page__breadcrumb" aria-label="פירורי לחם">
      <Link href="/">עמוד הבית</Link>
      <span aria-hidden="true">›</span>
      <span aria-current="page">קופה</span>
    </nav>
  )
}

export default function CheckoutPage(props: {
  searchParams: Promise<{ resume?: string; channel?: string }>
}) {
  return (
    <Suspense
      fallback={
        <div className="checkout-page">
          <CheckoutBreadcrumb />
          <h1 className="checkout-page__title">קופה</h1>
          <CheckoutShell />
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
  searchParams: Promise<{ resume?: string; channel?: string }>
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

  const { resume, channel } = await searchParams

  return (
    <div className="checkout-page">
      <CheckoutBreadcrumb />
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
        channel={channel === 'app' ? 'app' : 'web'}
      />
    </div>
  )
}
