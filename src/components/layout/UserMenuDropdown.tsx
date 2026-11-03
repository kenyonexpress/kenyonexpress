'use client'

import { EcUser } from '@/components/icons/electro-icons'
import { getTheme } from '@/lib/theme'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const UserMenuSignedIn = dynamic(() => import('./UserMenuSignedIn'), { ssr: false })

export default function UserMenuDropdown() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)
  // Guests keep the התחברות link. The dropdown (overview, orders, sign-out)
  // used to replace it for EVERY visitor once mounted, so a guest lost the
  // only login entry in the bar (C142). Same lazy client import as
  // SentryUserSync: the Supabase client stays out of the storefront chunk.
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const currentTheme = getTheme()
    setTheme(currentTheme)
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    void import('@/lib/supabase/client')
      .then(({ createClient }) => {
        if (cancelled) return
        const {
          data: { subscription },
        } = createClient().auth.onAuthStateChange((_event, session) => {
          setSignedIn(Boolean(session?.user))
        })
        unsubscribe = () => subscription.unsubscribe()
      })
      .catch(() => {})
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  if (theme === null || !signedIn) {
    return (
      <Link
        href="/login"
        className="hit-44 flex h-topbar-row items-center gap-1.5 text-icon transition-colors duration-200 hover:text-heading"
      >
        <EcUser size={16} aria-hidden="true" className="shrink-0" />
        התחברות
      </Link>
    )
  }

  return <UserMenuSignedIn initialTheme={theme} />
}
