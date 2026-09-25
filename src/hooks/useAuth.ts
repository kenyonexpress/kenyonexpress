'use client'

import type { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

/**
 * THE BROWSER SUPABASE CLIENT IS LOADED AFTER HYDRATION, NOT WITH IT.
 *
 * This hook sits in `WishlistProvider`, which wraps every storefront route, so
 * a static `import { createClient }` here put `@supabase/supabase-js` into the
 * script list of every page: one 69 KiB (gzip) chunk, 82% of it unused on the
 * home page by Lighthouse's own count, parsed before React could hydrate a
 * page whose only use for it is "is there a session". Measured 2026-09-25 on
 * the production build: the chunk was requested at 87 ms alongside the
 * framework, on both the home and the product page.
 *
 * The dynamic import moves it to its own chunk, fetched from this effect once
 * the page is interactive. Nothing observable changes for the visitor: the
 * heart counter already waits on the first `getUser()` round trip, and that
 * round trip is now a few milliseconds later. The type import is erased.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | undefined

    import('@/lib/supabase/client').then(({ createClient }) => {
      if (cancelled) return
      const supabase = createClient()

      supabase.auth.getUser().then(({ data }) => {
        if (cancelled) return
        setUser(data.user)
        setLoading(false)
      })

      const {
        data: { subscription: live },
      } = supabase.auth.onAuthStateChange((_, session) => {
        if (cancelled) return
        setUser(session?.user ?? null)
        setLoading(false)
      })
      subscription = live
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  return { user, loading, isAuthenticated: user !== null }
}
