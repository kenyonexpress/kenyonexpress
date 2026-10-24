'use server'

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_WORDING_VERSION,
  type ConsentDecision,
  serializeConsent,
} from '@/lib/analytics/consent'
import {
  CONSENT_GRANULAR_COOKIE,
  CONSENT_GRANULAR_MAX_AGE_SECONDS,
} from '@/lib/analytics/consent-categories'
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

  redirect(await backToWhereTheyWere())
}

/** The page the visitor was on, or the homepage if the header is unusable. */
async function backToWhereTheyWere(): Promise<string> {
  const referer = (await headers()).get('referer')
  if (!referer) return '/'
  try {
    const url = new URL(referer)
    return `${url.pathname}${url.search}`
  } catch {
    return '/'
  }
}

/**
 * WITHDRAW A DECISION ALREADY MADE, WHICH WAS PROMISED AND NOT POSSIBLE.
 *
 * `docs`-side, the cookie policy says measurement cookies are "written only
 * after you consent in the banner, and YOU MAY WITHDRAW AT ANY TIME", and names
 * the mechanism: "changing the consent decision: through the consent banner on
 * the site".
 *
 * The banner cannot be reached that way. It is rendered unconditionally in the
 * root layout and hidden before paint by the attribute
 * `CONSENT_PREPAINT_SCRIPT` puts on `<html>` as soon as the cookie exists, and
 * nothing anywhere re-opened it - searched 2026-09-08: `ConsentBanner` appears
 * in the layout and nowhere else, and the footer links the policy text only.
 * So the first click was final, and the document promised otherwise.
 *
 * Clearing the cookie is the whole fix: the pre-paint script stops hiding the
 * banner, and the next response asks again. No new UI state, no client
 * JavaScript, and the banner keeps being the one place a decision is made -
 * which is what the policy already says.
 */
async function runResetConsent(): Promise<void> {
  const jar = await cookies()
  jar.delete(CONSENT_COOKIE)
  redirect(await backToWhereTheyWere())
}

export async function decideConsent(formData: FormData): Promise<void> {
  return withActionContext('consent.decide', () => runDecideConsent(formData))
}

export async function resetConsent(): Promise<void> {
  return withActionContext('consent.reset', () => runResetConsent())
}

/**
 * C63: Save granular consent preferences (Analytics, Marketing).
 *
 * Sets the ke_consent_prefs cookie with granular settings.
 * Format: essential.analytics.marketing.version (e.g., "1.1.0.2")
 */
async function runSaveGranularConsent(value: string): Promise<void> {
  const jar = await cookies()
  jar.set({
    name: CONSENT_GRANULAR_COOKIE,
    value,
    maxAge: CONSENT_GRANULAR_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    // Readable by client-side analytics scripts
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  // Also set the legacy cookie for backward compatibility
  // If any category is granted, set old cookie to granted
  const parts = value.split('.')
  const hasAnyConsent = parts[1] === '1' || parts[2] === '1' // analytics or marketing

  jar.set({
    name: CONSENT_COOKIE,
    value: serializeConsent({
      decision: hasAnyConsent ? 'granted' : 'denied',
      wordingVersion: CONSENT_WORDING_VERSION,
    }),
    maxAge: CONSENT_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  redirect(await backToWhereTheyWere())
}

export async function saveGranularConsent(value: string): Promise<void> {
  return withActionContext('consent.saveGranular', () => runSaveGranularConsent(value))
}
