// Proves, end to end against production, that the in-app bell's realtime
// path actually fires -- because the failure mode it guards against is
// silent: a `postgres_changes` subscription on a table missing from the
// `supabase_realtime` publication (or on a role RLS filters out) connects,
// reports SUBSCRIBED, and receives nothing, forever, with no error anywhere.
// 198's header measured exactly that. A green run here is the only proof
// that is not "the catalog says it should work".
//
// WHAT IT DOES
//
//   1. Signs in as a probe user (email + password from argv) with the anon
//      key, exactly like the browser bell does.
//   2. Subscribes to INSERT + UPDATE on public.notifications filtered to the
//      probe's user_id, exactly like NotificationBell.tsx does.
//   3. Prints `SUBSCRIBED` and waits. The operator (or the session driving
//      this) then causes a notification_outbox INSERT for the probe user;
//      the 231 trigger fans it into public.notifications; realtime must
//      deliver it here.
//   4. On the INSERT event it marks the row read THROUGH THE AUTHENTICATED
//      CLIENT -- proving 198's column grant (`UPDATE (read_at)`) and policy
//      -- and waits for its own UPDATE event to come back.
//   5. Prints `PASS` and exits 0. Anything missing after 90s: `TIMEOUT`,
//      exit 1.
//
// Run: node scripts/verify-bell-realtime.mjs <email> <password>

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function envFromDotLocal() {
  const out = {}
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(
      '\n',
    )) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {
    /* fall through to process.env */
  }
  return out
}

const dotenv = envFromDotLocal()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? dotenv.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? dotenv.NEXT_PUBLIC_SUPABASE_ANON_KEY
const [email, password] = process.argv.slice(2)

if (!url || !anonKey || !email || !password) {
  console.error(
    'usage: node scripts/verify-bell-realtime.mjs <email> <password> (env needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)',
  )
  process.exit(2)
}

const supabase = createClient(url, anonKey)

const timeout = setTimeout(() => {
  console.error('TIMEOUT: no realtime delivery within 90s')
  process.exit(1)
}, 90_000)

const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
  email,
  password,
})
if (signInError || !signIn.user) {
  console.error(`SIGNIN FAIL: ${signInError?.message ?? 'no user'}`)
  process.exit(1)
}
const uid = signIn.user.id
console.log(`SIGNED IN uid=${uid}`)

let sawInsert = false

const channel = supabase
  .channel(`bell:${uid}`)
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
    async (payload) => {
      const row = payload.new
      console.log(
        `INSERT RECEIVED id=${row.id} kind=${row.kind} title=${row.title_he} body=${row.body_he} href=${row.href}`,
      )
      sawInsert = true
      // The bell's own write, through the same authenticated client: only
      // read_at, no user filter (RLS is the filter).
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
      if (error) {
        console.error(`MARK-READ FAIL: ${error.message}`)
        process.exit(1)
      }
      console.log('MARK-READ OK (column grant + RLS policy held)')
    },
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
    (payload) => {
      if (!sawInsert) return
      const before = payload.old
      const row = payload.new
      console.log(
        `UPDATE RECEIVED id=${row.id} old.read_at=${before.read_at ?? 'null'} new.read_at=${row.read_at}`,
      )
      console.log('PASS')
      clearTimeout(timeout)
      void supabase.removeChannel(channel).then(() => process.exit(0))
    },
  )
  .subscribe((status, err) => {
    console.log(`CHANNEL ${status}${err ? ` ${err.message}` : ''}`)
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('SUBSCRIBE FAIL')
      process.exit(1)
    }
  })
