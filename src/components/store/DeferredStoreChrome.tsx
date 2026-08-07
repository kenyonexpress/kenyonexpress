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

export default function DeferredStoreChrome() {
  return (
    <>
      <CartDrawer />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </>
  )
}
