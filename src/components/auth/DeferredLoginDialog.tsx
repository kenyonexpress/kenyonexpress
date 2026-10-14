'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useLoginDialogRequest } from './useLoginDialogRequest'

/**
 * The login dialog (UX23) is chrome that never paints the first viewport: it
 * exists only after a press on a login link. Its module loads after
 * hydration, the same call `DeferredStoreChrome` makes for the cart drawer,
 * which keeps `LoginPanel`, the passkey client and the auth actions'
 * references off the initial JS path of every storefront page.
 *
 * The LISTENER is here and not in the dialog, so a press is claimed the
 * moment the shell hydrates (see useLoginDialogRequest for the race this
 * closes), and the chunk is warmed once the page is idle so the first press
 * does not wait on the network. `phoneEnabled` is read on the server by the
 * shell that mounts this, so the dialog and the /login page answer the SMS
 * question from the same variable.
 */
const LoginDialog = dynamic(() => import('@/components/auth/LoginDialog'), { ssr: false })

export default function DeferredLoginDialog({ phoneEnabled = false }: { phoneEnabled?: boolean }) {
  const request = useLoginDialogRequest()
  useEffect(() => {
    const warm = () => void import('@/components/auth/LoginDialog')
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm)
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(timer)
  }, [])
  if (!request) return null
  return <LoginDialog request={request} phoneEnabled={phoneEnabled} />
}
