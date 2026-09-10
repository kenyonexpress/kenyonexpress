'use client'

import { BottomTabBarView, activeTabHref } from '@/components/layout/BottomTabBar'
import { usePathname } from 'next/navigation'

/**
 * The only part of the bottom bar that needs to know the current URL.
 *
 * `usePathname()` is a client hook, and under `cacheComponents` a client hook
 * on a prerendered route is `CLIENT_HOOK_DYNAMIC`: with it inline in the bar,
 * `pnpm build` refused to prerender `/gift/[token]` and the whole build failed.
 * The store layout is emphatic that its routes must stay statically rendered,
 * so the hook is isolated to this file and the layout renders it behind a
 * `<Suspense>` whose fallback is the same bar with nothing lit.
 *
 * The swap is invisible. Both variants render identical geometry, and the space
 * the bar occupies is reserved by `--reserve-tabbar` in `globals.css` rather
 * than by the element, so nothing moves when this arrives. What changes is
 * which label is bold and which link carries `aria-current`.
 */
export default function BottomTabBarActive() {
  const pathname = usePathname() ?? '/'
  return <BottomTabBarView active={activeTabHref(pathname)} />
}
