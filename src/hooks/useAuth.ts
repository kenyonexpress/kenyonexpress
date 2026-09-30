'use client'

import { currentUserId } from '@/server/actions/session'
import { useEffect, useState } from 'react'

/**
 * Whether the visitor is signed in, and as whom.
 *
 * Answered by the server (`server/actions/session.ts`) rather than by the
 * browser client: the session cookie is HttpOnly (STEP 18), so the browser
 * client's `getUser()` would say "nobody" for every signed-in customer. Only
 * the id crosses; a component that needs the profile reads it under RLS on
 * the server.
 */
export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void currentUserId().then((id) => {
      if (cancelled) return
      setUserId(id)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { userId, loading, isAuthenticated: userId !== null }
}
