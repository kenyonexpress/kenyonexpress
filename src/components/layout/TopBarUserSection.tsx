import { EcUser } from '@/components/icons/electro-icons'
import UserMenu from '@/components/layout/UserMenu'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function TopBarUserSection() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <Link
        href="/login"
        className="hit-44 flex h-topbar-row items-center gap-1.5 transition-opacity hover:opacity-70"
        style={{ color: 'var(--color-icon)' }}
      >
        <EcUser size={16} aria-hidden="true" />
        התחברות
      </Link>
    )
  }

  return <UserMenu email={user.email || ''} />
}
