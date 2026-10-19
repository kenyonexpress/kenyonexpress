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

/**
 * React 19 Fizz streaming scripts. These are generated during the build by React's
 * streaming runtime and must be whitelisted by hash in the CSP policy.
 * Each React/Next upgrade may introduce new script hashes here.
 *
 * Note: Turbopack chunk loader scripts (Next.js 16.4+) change their hash with each
 * build due to varying chunk names. These hashes may need updating after builds
 * if the csp-shell-gate reports new blocked scripts.
 */
export const REACT_STREAMING_SCRIPT_HASHES = Object.freeze([
  'sha256-9V7dm2iwdgPjaoJbaySXkJmq4pxKa/XT8ym8nD2hrNE=',
  'sha256-fk0hq8vVCEr/mxFfq2UBOsX/0g+NyYZ3M0/b0lAh0gs=',
  'sha256-T/7zYwglk2GtiMuIrytx7hcVWICLmk7P3i+Hf/F59ow=',
  'sha256-w4pUXS9jb2sAuVmk7s+ATwD4PheVuMnEjHN+zkcgphY=',
  'sha256-mRqoW35/hUt6IBePH3HXlN57umWH+G3oj/2eC4tOWeQ=',
  'sha256-P474TMB+UhYEjz53cp6dWHUHryu6ZXlvKlUWx7Oy0Vk=',
  'sha256-rimaae54utIpqXy4SfzTCYOBzW44nNmADdqfIGg1pkE=',
  'sha256-Dg/gjlPqSTWzjJugJdXkv3DqTtnEdcJgA+xG1tOtA2Q=',
  'sha256-NDWPU7P2kxYORIDs+YPoKGb/r8ePBkLxwjnJHfCHaJo=',
  'sha256-WXZE1yuUPmR87n1G2LBx23Wu78FgtUxqSH7eKZH5pJ4=',
  'sha256-HW9xHbWewtKLcte8PfhJJcte0U53pFbUYm3p14FEpiI=',
  'sha256-yA7VLd8QHjVOqhUs4hXCjYIInsU3swQ15a4I8lnMMGI=', // Turbopack (prior build)
  'sha256-hyxaJHwapGA2mumJo1yvrGAcXV0vzo6lxuVetkJ6K+I=', // Turbopack (prior)
  'sha256-afeknX27uf/S4OOzgkviZLGBGU6659po6SYZoHEd+cs=', // Turbopack (prior)
  'sha256-9wBzszLx7afgG7BGDs9n9AXxF9knvjeuQtrXCaC+TGo=', // Turbopack chunk loader
  'sha256-PvFFSiSPcnvX2aNaahqtOXRWgigeZIVLrt4JkQAkJXU=', // Turbopack chunk loader
  'sha256-YBsdXQLoWx+J4NAA1FcCsLR92bwt2N5y88VGgA/L8Ps=', // Turbopack chunk loader
  'sha256-zVIl8e3WT1C3Tvs0zEc4QNaO37KqHUFUzXC/2Qemfxs=', // Turbopack chunk loader
  'sha256-L4ZGQOoEHiQbdfiPK9dYV+RP/qu7j1ukAgW9v6ObjJ0=', // Turbopack chunk loader (variable)
  'sha256-qZ6GFFr/8XY7pYGHpRiUovm6sHFnSsCRM39Xta2cMcs=', // Turbopack chunk loader
  'sha256-JOSl2LK32To6OK/+B1xsMCuMbVCea+cFP3dqX069Y70=', // Turbopack chunk loader
  'sha256-72YxmZdur3qzLDFaVOG9W1Q8ikeTCICpGXFP3X3F3E4=', // Turbopack chunk loader
  'sha256-GTUzPFak8FpFFOg2vwjnFoZG8rNjgba0Q0n3JegY8hY=', // Turbopack chunk loader (Next 16.4+)
  'sha256-gALIePzh275h3B0zC/YyIsHCeC10M/A1HnTob9xAa9c=', // Turbopack chunk loader (UX33 color tokens)
  'sha256-qSZiUplOTj91+hS0J36U/8wAJG6Kc0QE1Q9315HnSfM=', // Turbopack chunk loader (UX33 tests)
  'sha256-W3cDtuDMTudBZWQdVR1ehtCMpnrPLAy5aaGeTQ4E9aY=', // Turbopack chunk loader (UX34 spacing scale)
  'sha256-ukCh0SPufg0uBpI+wigEWtuthxbgtJeHTwbSWse8hN8=', // Turbopack chunk loader (UX34 components)
  'sha256-HZOoJ+hXCz5w9MIKfvvLTaOnyAL1ta7eDQDNhZCxlLk=', // Turbopack chunk loader (UX34 additional components)
  'sha256-jBv5YD+pwHGOFLMzs9fcKz+OSV6Bso0YMiPgHqqvJks=', // Turbopack chunk loader (UX36 shadow tokens)
  'sha256-IQSNmL85iWW4xjQ2/Pcid5U/CMhrc9kBjtD0jolJkqw=', // Turbopack chunk loader (instant = false city pages)
])

/** Every hash the document policy carries, in the order it emits them. */
export const SHELL_INLINE_SCRIPT_HASHES = Object.freeze([
  CONSENT_PREPAINT_SCRIPT_HASH,
  REACT_RENDER_TIMING_SCRIPT_HASH,
  ...REACT_STREAMING_SCRIPT_HASHES,
])
