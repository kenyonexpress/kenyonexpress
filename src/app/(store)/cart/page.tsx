import CartPageView from '@/components/cart/CartPageView'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import type { Metadata } from 'next'
// cart-page.css is imported by the root layout. See the note there.

export const metadata: Metadata = {
  title: 'סל הקניות',
}

export default async function CartPage() {
  const [cart, supabase] = await Promise.all([getCart(), createClient()])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return <CartPageView initialCart={cart} isAuthenticated={!!user} />
}
