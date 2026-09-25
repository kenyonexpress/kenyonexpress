'use client'

import { attributedShareUrl } from '@/lib/affiliates/share-url'
import { getMyShareCode } from '@/server/actions/affiliates'
import { useCallback, useEffect, useState } from 'react'

/**
 * The sharer's code for the product page's share row, fetched once per page
 * for a signed-in visitor and never for an anonymous one.
 *
 * WHY A CLIENT HOOK AND NOT A PROP FROM THE PAGE. The product page is cached
 * and identical for everyone; reading the viewer's session while rendering it
 * would make the whole page per-user. The share row is a client component
 * already, the browser Supabase client knows whether there is a session, and
 * only when there is one does a single server action ask "does this person
 * have a code worth putting on a link". Anonymous visitors, which is most of
 * the traffic, pay nothing.
 *
 * NOTHING HERE MAY THROW. A share without attribution is still a share, and
 * the row renders in environments with no Supabase configuration at all (the
 * component tests). So the client is built inside a try, and every failure
 * leaves the code at null.
 *
 * `shareHref()` is read AT CLICK TIME from `window.location.href`, as every
 * share button here already does, so the code is added to whatever page the
 * customer is actually on.
 *
 * THE CLIENT IS IMPORTED LAZILY for the same reason as in `useAuth`: this hook
 * is on every product page, and a static import put `@supabase/supabase-js`
 * into that page's initial script list. The "nothing may throw" rule above
 * holds through the import too - a rejected import lands in the same catch.
 */
export function useShareAttribution(): { shareHref: () => string; code: string | null } {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    import('@/lib/supabase/client')
      .then(({ createClient }) => {
        if (cancelled) return null
        return createClient().auth.getUser()
      })
      .then((result) => {
        if (cancelled || !result || !result.data.user) return null
        return getMyShareCode()
      })
      .then((value) => {
        if (!cancelled && typeof value === 'string') setCode(value)
      })
      .catch(() => {
        // Not signed in, no Supabase configuration, or the action is
        // unreachable. The link stays clean.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shareHref = useCallback(
    () => (typeof window === 'undefined' ? '' : attributedShareUrl(window.location.href, code)),
    [code],
  )

  return { shareHref, code }
}
