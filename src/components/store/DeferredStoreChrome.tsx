'use client'

import dynamic from 'next/dynamic'

/**
 * Cart drawer and toaster are interactive chrome that does not paint the first
 * viewport. Loading them after hydration ([25]) keeps their modules off the
 * initial JS critical path that Lantern folds into TTI/LCP.
 *
 * WhatsAppFloat stays in the server layout: it is a Server Component with no
 * client JS of its own.
 */
const CartDrawer = dynamic(() => import('@/components/cart/CartDrawer'), {
  ssr: false,
})
const Toaster = dynamic(() => import('@/components/ui/sonner').then((m) => m.Toaster), {
  ssr: false,
})
// The phone's sticky cart bar. It can only ever paint after the cart has
// arrived, which is after hydration by design (see CartBootstrap), so
// deferring the module costs it nothing and keeps it out of the first load.
const MobileCartBar = dynamic(() => import('@/components/cart/MobileCartBar'), {
  ssr: false,
})

export default function DeferredStoreChrome() {
  return (
    <>
      <CartDrawer />
      <MobileCartBar />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </>
  )
}
