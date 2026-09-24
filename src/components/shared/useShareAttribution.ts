'use client'

import { attributedShareUrl } from '@/lib/affiliates/share-url'
import { createClient } from '@/lib/supabase/client'
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
 */
export function useShareAttribution(): { shareHref: () => string; code: string | null } {
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let supabase: ReturnType<typeof createClient>
    try {
      supabase = createClient()
    } catch {
      return
    }
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled || !data.user) return null
        return getMyShareCode()
      })
      .then((value) => {
        if (!cancelled && typeof value === 'string') setCode(value)
      })
      .catch(() => {
        // Not signed in, or the action is unreachable. The link stays clean.
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
