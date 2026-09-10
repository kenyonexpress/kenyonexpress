import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { buildAccountExport, exportFilename } from '@/server/account/export-data'
import { NextResponse } from 'next/server'

/**
 * The right-of-access download: everything this account holds, as one file.
 *
 * GDPR article 15 and section 13 of the Israeli Privacy Protection Law. The
 * deletion half of that pair already existed - `lib/account/delete-account.ts`,
 * wired to a confirmation phrase and `fn_anonymize_user` - and the access half
 * did not exist at all. Measured 2026-09-10: nothing under `src/app/api`
 * matched `export`, so a customer asking what we hold on them had no answer
 * except a support ticket.
 *
 * POST, NOT GET, AND NOT BECAUSE OF CSRF. A session-cookie GET is not
 * meaningfully forgeable for a *read* the attacker cannot see, same-origin
 * policy being the control. The reason is prefetch: a GET that dumps an entire
 * account is one a browser's link prefetcher, a chat client's preview fetcher
 * or a corporate link scanner will fire on its own, unprompted, off a URL
 * sitting in someone's history. POST is the shape that only runs when a person
 * asks.
 *
 * IT ANSWERS THE CALLER DIRECTLY RATHER THAN MAILING A SIGNED LINK, and that is
 * a deliberate departure from the brief. `RESEND_API_KEY` is absent from the
 * project that serves production, and `lib/email/resend.ts` treats an absent
 * key as deliberate silence - it logs `email.disabled` and returns, with no
 * error and no dead row. An emailed link would therefore have been a right of
 * access that delivers nothing, silently, which is the worst possible way to
 * fail a compliance obligation. A direct download needs no working mailer, no
 * signing secret and no 24-hour expiry window to reason about, and it puts the
 * file in the hands of the one person entitled to it, in the session that
 * proved they are that person.
 *
 * `no-store`, unconditionally: the body is one customer's entire account.
 */

async function handlePOST(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'not_signed_in' }, { status: 401 })
  }

  // Keyed on the user and not the IP. This is expensive - eleven scoped reads -
  // and it is only reachable with a session, so the IP adds nothing except a
  // shared household or office sharing one bucket.
  const decision = await rateLimit('account-export', user.id)
  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: rateLimitHeaders(decision) },
    )
  }

  const payload = await buildAccountExport(supabase, user.id)

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename()}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export const POST = withRequestLog('/api/account/export', handlePOST)
