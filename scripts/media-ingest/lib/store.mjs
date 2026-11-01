// Where ingested bytes land: R2 when it answers, local disk when it refuses.
//
// The fallback exists because a 403 from R2 is not a transient error. It is
// one of exactly three states -- credentials absent, credentials revoked, or
// R2 not enabled on the account (code 10042, the state measured on 2026-09-09)
// -- and none of them heals mid-run. So the first 403 flips the WHOLE RUN to
// local storage instead of paying one doomed round trip per derivative, and
// the flip is recorded so the ledger can say `storage = 'local'` honestly.
//
// Local objects keep the exact R2 key under public/images/cdn/, so a later
// run with working R2 uploads the same content-addressed keys and nothing
// downstream has to re-derive anything: the URL merely changes host, from a
// same-origin /images/cdn/... path to R2_PUBLIC_BASE_URL.
//
// Only a 403-class refusal falls back. A 5xx or a network error is retried by
// the caller or recorded as `failed`: silently storing locally because of a
// timeout would hide a working-but-slow R2 behind a fallback meant for a
// disabled one.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const LOCAL_URL_PREFIX = '/images/cdn'

/** True for the errors that mean "R2 will refuse this run, stop asking". */
export function isForbiddenR2Error(err) {
  const text = String(err?.message ?? err ?? '')
  return (
    /\b403\b/.test(text) ||
    /AccessDenied|SignatureDoesNotMatch|InvalidAccessKeyId|Unauthorized/i.test(text) ||
    /10042|enable R2/i.test(text) ||
    /R2 is not configured/.test(text)
  )
}

export function localPathForKey(localRoot, key) {
  return resolve(localRoot, key)
}

export function localUrlForKey(key) {
  return `${LOCAL_URL_PREFIX}/${key}`
}

/**
 * A put() with the sticky fallback baked in.
 *
 * `r2` is the r2Put/isR2Configured/r2PublicUrl trio from
 * scripts/wp-import/lib/r2.mjs, injected so tests can hand in a liar.
 */
export function makeStore({ r2, localRoot, log = () => {} }) {
  let mode = r2.isR2Configured() ? 'r2' : 'local'
  let fallbackReason = mode === 'local' ? 'R2 credentials are not configured' : null

  if (mode === 'local') log(`local storage from the start: ${fallbackReason}`)

  const putLocal = (key, buffer) => {
    const path = localPathForKey(localRoot, key)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, buffer)
    return { storage: 'local', key, url: localUrlForKey(key) }
  }

  return {
    get mode() {
      return mode
    },
    get fallbackReason() {
      return fallbackReason
    },
    async put(key, buffer, contentType) {
      if (mode === 'local') return putLocal(key, buffer)
      try {
        const { url } = await r2.r2Put(key, buffer, { contentType })
        return { storage: 'r2', key, url }
      } catch (err) {
        if (!isForbiddenR2Error(err)) throw err
        mode = 'local'
        fallbackReason = String(err.message ?? err)
        log(`R2 refused (${fallbackReason}); storing locally for the rest of the run`)
        return putLocal(key, buffer)
      }
    },
  }
}
