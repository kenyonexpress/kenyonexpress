#!/usr/bin/env node
/**
 * WHAT IS ACTUALLY DEPLOYED, ASKED OF THE DEPLOYMENT.
 *
 * `docs/LAUNCH-READINESS-2026-09-08.md` risk 1 and MANUAL item 1 read "find who
 * serves kenyonexpress.vercel.app", on the evidence that `/api/ready` 404s and
 * no matching project is visible in the Vercel team. Measured 2026-09-08, that
 * conclusion was wrong in a way that matters: the host IS serving. `/` and
 * `/api/health` answer 200 and `/api/cron/health` answers 401, which is a live
 * Next build refusing an unauthenticated cron call.
 *
 * The real problem is narrower and more actionable: NOTHING HAS DEPLOYED TO IT
 * FOR A WEEK. `/api/ready` was added on 2026-09-02, exists on `main` and on
 * `closeout/v1-final`, carries no auth, and is absent from the running build.
 *
 * That distinction changes what the owner has to do. "Find the host" is a
 * search. "Point a deploy at the host that is already serving" is a button.
 *
 * HOW IT DATES THE BUILD. Each marker below is a route that (a) exists in this
 * repo, (b) needs no credential to answer, and (c) has a known first-commit
 * date. The newest marker that is PRESENT and the oldest that is ABSENT bracket
 * the deployed build. Markers are cheap; add one whenever a dateable public
 * route lands.
 *
 * IT REFUSES RATHER THAN GUESSES. If the origin itself does not answer, every
 * marker would read "absent" and the script would report a very old build
 * instead of an unreachable one. That check runs first and exits 2.
 *
 *   node scripts/audit-deployed-build.mjs
 *   BASE=https://example.vercel.app node scripts/audit-deployed-build.mjs
 */

export const DEFAULT_BASE = 'https://kenyonexpress.vercel.app'

/**
 * `added` is the first-commit date from `git log --diff-filter=A`.
 * `expect` is the status a build that HAS the route returns: 401 counts as
 * present, because a route that refuses a caller is a route that exists.
 */
export const MARKERS = [
  { path: '/', added: '2026-06-01', expect: [200], note: 'the app itself' },
  { path: '/api/health', added: '2026-06-01', expect: [200, 503], note: 'db probe' },
  { path: '/api/cron/health', added: '2026-08-20', expect: [401], note: 'cron auth' },
  { path: '/api/ready', added: '2026-09-02', expect: [200, 503], note: 'dependency report' },
]

export function isPresent(status, expect) {
  return expect.includes(status)
}

/** The bracket: newest present marker, oldest absent one. */
export function bracket(results) {
  const present = results
    .filter((r) => r.present)
    .map((r) => r.added)
    .sort()
  const absent = results
    .filter((r) => !r.present)
    .map((r) => r.added)
    .sort()
  return {
    newestPresent: present.length > 0 ? present[present.length - 1] : null,
    oldestAbsent: absent.length > 0 ? absent[0] : null,
  }
}

async function probe(base, marker) {
  try {
    const res = await fetch(base + marker.path, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    return { ...marker, status: res.status, present: isPresent(res.status, marker.expect) }
  } catch (error) {
    return { ...marker, status: 0, present: false, error: String(error) }
  }
}

async function main() {
  const base = process.env.BASE ?? DEFAULT_BASE

  // The origin check comes first, on purpose. An unreachable host makes every
  // marker absent, which reads as "a very old build" rather than "no build".
  const root = await probe(base, MARKERS[0])
  if (!root.present) {
    console.error(`audit-deployed-build: ${base} did not answer (status ${root.status}).`)
    console.error('Nothing can be concluded about the deployed build from here.')
    process.exit(2)
  }

  const results = [root]
  for (const marker of MARKERS.slice(1)) results.push(await probe(base, marker))

  console.log(`base ${base}\n`)
  for (const r of results) {
    console.log(
      `  ${r.present ? 'present' : 'ABSENT '}  ${String(r.status).padStart(3)}  ${r.path.padEnd(20)} added ${r.added}  ${r.note}`,
    )
  }

  const { newestPresent, oldestAbsent } = bracket(results)
  console.log('')
  if (!oldestAbsent) {
    console.log(`the deployed build carries every marker, newest added ${newestPresent}`)
    process.exit(0)
  }
  console.log(
    `the deployed build PREDATES ${oldestAbsent}; newest marker it has is ${newestPresent}`,
  )
  console.log('It is serving. It is stale. Those need different fixes.')
  process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
