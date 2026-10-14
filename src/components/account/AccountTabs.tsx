'use client'

import { activeAccountTab } from '@/lib/account/tabs'
import { usePathname } from 'next/navigation'
import AccountTabsList from './AccountTabsList'

/**
 * The account's top tab bar (UX18). Rendered by the account layout inside
 * `.account-shell`, where the grid puts it above the content column on a
 * desktop and FIRST on a phone, ahead of the side nav: measured before this
 * existed, the nav was 938px tall at 380 and the page's own content started
 * at y=1174. The links scroll sideways on a phone rather than wrap, so the
 * bar is one row at every width (44px tall, the touch floor).
 *
 * The markup is `AccountTabsList`, which is server-safe and is also the
 * layout's Suspense fallback with no tab lit: `usePathname()` is a dynamic
 * client hook, and under `cacheComponents` a dynamic hook outside a
 * boundary blocks the static shell of every route in the segment (the
 * build stopped on /account/orders/[id] with CLIENT_HOOK_DYNAMIC). So the
 * five links paint with the shell and the current one lights when the
 * client arrives; nothing moves, because the two renders are the same
 * element tree.
 */
export default function AccountTabs() {
  const pathname = usePathname()
  return <AccountTabsList active={activeAccountTab(pathname)} />
}
