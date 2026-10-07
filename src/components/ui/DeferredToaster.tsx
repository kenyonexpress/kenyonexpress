'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

/**
 * The sonner `<Toaster>` behind a dynamic import, for the layouts that are
 * server components and therefore cannot call `next/dynamic` with `ssr: false`
 * themselves (`(main)` and `(account)`). The store shell already does this
 * inside DeferredStoreChrome; this is the same deferral for the other two
 * route groups, so sonner leaves their first load as well (STEP 34).
 *
 * Nothing is lost by `ssr: false`: a toast is a reaction to a client action,
 * and the first one cannot happen before hydration.
 */
const Toaster = dynamic(() => import('@/components/ui/sonner').then((m) => m.Toaster), {
  ssr: false,
})

export default function DeferredToaster(props: ComponentProps<typeof Toaster>) {
  return <Toaster {...props} />
}
