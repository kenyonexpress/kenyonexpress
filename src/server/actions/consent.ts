'use server'

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_WORDING_VERSION,
  type ConsentDecision,
  serializeConsent,
} from '@/lib/analytics/consent'
import { withActionContext } from '@/lib/observability/action-context'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Persist a consent decision and reload the page the visitor was on.
 *
 * The banner used to be a Client Component only so the buttons could write a
 * cookie. That pulled React hydration onto every route for two clicks. A
 * server action + full navigation lets the pre-paint snippet hide the banner
 * on the next response with no client JS on the critical path ([25]).
 */
async function runDecideConsent(formData: FormData): Promise<void> {
  const raw = formData.get('decision')
  if (raw !== 'granted' && raw !== 'denied') return
  const decision = raw as ConsentDecision

  const jar = await cookies()
  jar.set({
    name: CONSENT_COOKIE,
    value: serializeConsent({ decision, wordingVersion: CONSENT_WORDING_VERSION }),
    maxAge: CONSENT_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    // Readable by the pre-paint snippet and the analytics client.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  const referer = (await headers()).get('referer')
  let path = '/'
  if (referer) {
    try {
      const url = new URL(referer)
      path = `${url.pathname}${url.search}`
    } catch {
      path = '/'
    }
  }
  redirect(path)
}

export async function decideConsent(formData: FormData): Promise<void> {
  return withActionContext('consent.decide', () => runDecideConsent(formData))
}
