'use server'

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_WORDING_VERSION,
  type ConsentDecision,
  serializeConsent,
} from '@/lib/analytics/consent'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
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
/** The page the visitor was on, so the decision reloads it rather than `/`. */
async function returnPath(): Promise<string> {
  const referer = (await headers()).get('referer')
  if (!referer) return '/'
  try {
    const url = new URL(referer)
    return `${url.pathname}${url.search}`
  } catch {
    return '/'
  }
}

async function runDecideConsent(formData: FormData): Promise<void> {
  const raw = formData.get('decision')
  if (raw !== 'granted' && raw !== 'denied') return
  const decision = raw as ConsentDecision

  // THE RECORD. The cookie is what the browser acts on; this line is what the
  // operator can point at. It rides the action's request context (request id,
  // route, timestamp) and carries the wording version, so "what did they
  // agree to, and when" has an answer that is not the visitor's own cookie.
  // No identity: a consent log keyed on a person would itself be the kind of
  // profile the banner asks permission to build.
  log.info('consent.decided', { decision, wordingVersion: CONSENT_WORDING_VERSION })

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

  redirect(await returnPath())
}

export async function decideConsent(formData: FormData): Promise<void> {
  return withActionContext('consent.decide', () => runDecideConsent(formData))
}

/**
 * Take a consent decision back.
 *
 * Deleting the cookie, not writing `denied`: the two are not the same thing.
 * `denied.N` is a decision the visitor made and the banner stays hidden; no
 * cookie at all means undecided, the pre-paint snippet finds nothing, and the
 * banner is shown again on the very next response. Withdrawal is "ask me
 * again", which is what the cookie policy promises its button does.
 *
 * Logged like the decision itself, for the same reason.
 */
async function runWithdrawConsent(): Promise<void> {
  log.info('consent.withdrawn', { wordingVersion: CONSENT_WORDING_VERSION })
  const jar = await cookies()
  jar.delete({ name: CONSENT_COOKIE, path: '/' })
  redirect(await returnPath())
}

export async function withdrawConsent(): Promise<void> {
  return withActionContext('consent.withdraw', () => runWithdrawConsent())
}
