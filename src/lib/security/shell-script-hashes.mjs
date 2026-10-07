/**
 * The inline scripts that are allowed to run WITHOUT a nonce, by hash.
 *
 * WHY THERE ARE ANY
 *
 * `next build` prerenders a static shell for every page (cacheComponents), and
 * that shell is served from the cache on every request. No request exists when
 * it is built, so nothing in it can carry the per-request nonce the proxy
 * mints. Measured 2026-10-07 on the built shells (`.next/server/app/*.html`):
 * every one holds the same two inline scripts and nothing else that executes,
 * and both are constants. Everything that varies (React's flight data, the
 * `$RC`/`$RX` helpers, next/script) is written at request time by the resume
 * render, which carries the nonce. So the policy is
 *
 *     script-src 'self' 'nonce-<request>' <these two hashes>
 *
 * with no 'unsafe-inline' and no host but our own.
 *
 * Plain .mjs rather than .ts so that `scripts/security/csp-shell-gate.mjs`,
 * which runs after `next build` with no TypeScript loader, reads the same
 * list the proxy enforces. A hash that is here and not in the shells is a
 * harmless leftover; a shell script that is not here is a blocked script, and
 * the gate fails the build on it rather than letting production find out.
 */

/**
 * The consent pre-paint snippet, `CONSENT_PREPAINT_SCRIPT` in
 * `lib/analytics/consent.ts`, inlined first in <body> by the root layout. Its
 * text is built from module constants only; `frame-policy.test.ts` recomputes
 * this hash from the live constant so the two cannot drift.
 */
export const CONSENT_PREPAINT_SCRIPT_HASH = 'sha256-NkB+bKWzwupbsiv4EI022OEm1NRWnmWhV+hDhjsrKXc='

/**
 * React's render-timing probe, emitted by Fizz at the top of every prerendered
 * document: `requestAnimationFrame(function(){$RT=performance.now()});`.
 * React-internal, so a React upgrade may change its text; the gate catches
 * that at build time and this constant is updated with the new text below.
 */
export const REACT_RENDER_TIMING_SCRIPT =
  'requestAnimationFrame(function(){$RT=performance.now()});'
export const REACT_RENDER_TIMING_SCRIPT_HASH = 'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='

/** Every hash the document policy carries, in the order it emits them. */
export const SHELL_INLINE_SCRIPT_HASHES = Object.freeze([
  CONSENT_PREPAINT_SCRIPT_HASH,
  REACT_RENDER_TIMING_SCRIPT_HASH,
])
