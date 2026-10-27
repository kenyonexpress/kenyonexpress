import { type ClubStanding, clubStanding } from '@/lib/club/tiers'
import { type Agorot, agorot } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

/** The signed-in customer's club standing, or null when signed out or on any read failure. */
export async function getMyClubStanding(): Promise<ClubStanding | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  // fn_club_spend_12mo is not in the generated DB types until 243 is applied.
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: object) => Promise<{ data: unknown; error: unknown }>
    }
  ).rpc('fn_club_spend_12mo', { p_user: user.id })
  if (error || typeof data !== 'number') return null
  return clubStanding(agorot(data) as Agorot)
}
