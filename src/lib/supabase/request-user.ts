import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

/**
 * The signed-in user, verified once per server render.
 *
 * `auth.getUser()` is a round trip to the auth server, and every account query
 * made its own: one /account render (the side nav's five reads and the page's
 * six) asked the same question eleven times in parallel. Measured on V08 from a
 * 335ms-RTT link, those calls took 1.7 to 5 s each and the page's content
 * painted at 8 s. React's `cache` scopes the answer to the one request, so it
 * is still the auth server's verdict on this request's cookies, asked once.
 *
 * Outside a server component render (server actions, route handlers, tests)
 * `cache` does not memoise and this is exactly the old per-call read.
 */
export const getRequestUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
