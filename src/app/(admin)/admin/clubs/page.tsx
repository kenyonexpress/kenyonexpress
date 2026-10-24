import { permanentRedirect } from 'next/navigation'

// F11 asked for /admin/clubs; the editor lives at /admin/club-tiers (sidebar
// and server action already point there), so this path forwards to it.
export default function ClubsAliasPage(): never {
  permanentRedirect('/admin/club-tiers')
}
