'use client'

import { PullToRefresh } from '@/components/mobile'

const pullToRefreshPath = (pathname: string) => pathname === '/' || pathname.startsWith('/category')

const reload = async () => {
  window.location.reload()
}

/**
 * Pull-to-refresh on the home and category pages.
 *
 * The wrapper renders on every store page and the path is checked when a pull
 * starts, not here. This used to branch on usePathname() and return either the
 * wrapper or the bare children: two different element trees, so any request
 * where the server saw a different path than the browser (a cached shell, a
 * Suspense fallback) failed hydration with React #418 on the home page, and a
 * client navigation to or from / remounted the whole page.
 */
export default function MobileContentWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PullToRefresh enabled={pullToRefreshPath} onRefresh={reload}>
      {children}
    </PullToRefresh>
  )
}
