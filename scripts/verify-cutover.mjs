#!/usr/bin/env node
/**
 * Has kenyonexpress.co.il actually cut over to this deployment, and is it
 * healthy once it has? docs/INFRA-TASKS.md task 9, replacing the DOM1-DOM8 /
 * SSL3 / SSL8 / VCL6 / VCL7 rows in docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md,
 * which existed only as `dig`/`curl` commands to run by hand with an empty
 * checkbox column next to them.
 *
 * VERIFIES BY BEHAVIOUR, NOT BY IP. Vercel's anycast addresses are not
 * contractual and the checklist itself says "per the Domains UI" rather than
 * naming one. So this asks what a browser would actually experience: does the
 * apex resolve, does http redirect to https, is the TLS cert valid, does the
 * home page answer 200, does /api/health say the database is reachable, and
 * -- the identity check -- does the co.il response carry the SAME
 * `x-vercel-id` shape and the same health body as kenyonexpress.vercel.app,
 * which is the deployment this repository actually controls.
 *
 * THREE EXIT CODES, NOT A BOOLEAN.
 *
 *   0  cut over AND healthy               -- the only "done" answer
 *   2  not yet cut over                   -- NXDOMAIN, or resolves somewhere
 *                                             that is not Vercel at all. This
 *                                             is the expected, current state
 *                                             (measured repeatedly since
 *                                             20.09: no NS, no A, no SOA).
 *   1  cut over but broken                -- resolves to Vercel, but TLS, the
 *                                             200 or the identity check fails.
 *                                             This is the case worth an alert.
 *
 * A binary gate would have made the months before cutover a permanent red
 * wall, which trains everyone to stop reading it. Exit 2 says "nothing wrong
 * yet" in words, not in a colour.
 *
 * PROPAGATION IS RELATIVE TO THE RESOLVER ASKING. A GitHub Actions runner and
 * a laptop can disagree for hours after a real change even with a low TTL
 * (DOM4 in the checklist). Every line here names the resolver -- Cloudflare's
 * 1.1.1.1, the same one scripts/dns-watch.sh already polls -- so "cut over"
 * is stated as true for that resolver, not as a global fact.
 *
 * NEVER TOUCHES DNS. Verification only, same rule as dns-watch.sh: this
 * script cannot cause the thing it is checking for.
 */

import { resolve4, resolveNs, setServers } from 'node:dns/promises'

const APEX = 'kenyonexpress.co.il'
const WWW = 'www.kenyonexpress.co.il'
const VERCEL_REFERENCE = 'https://kenyonexpress.vercel.app'
const RESOLVER = '1.1.1.1'
const TIMEOUT_MS = 15_000

setServers([RESOLVER])

/** @typedef {{ ok: true, address: string } | { ok: false, code: string }} ResolveResult */

/**
 * @param {string} host
 * @returns {Promise<ResolveResult>}
 */
export async function resolveHost(host) {
  try {
    const addresses = await resolve4(host)
    return { ok: true, address: addresses[0] ?? '' }
  } catch (err) {
    return { ok: false, code: /** @type {NodeJS.ErrnoException} */ (err).code ?? 'UNKNOWN' }
  }
}

/**
 * Whether a resolved address is Vercel's, without hardcoding an IP.
 *
 * A NEW A record that is NOT Vercel (a parking page, a different host) is a
 * distinct, worse case than NXDOMAIN: DNS moved, but not to us. Detected by
 * asking the SAME resolver for the zone's nameservers, since Vercel-issued
 * DNS for a domain onboarded through it carries `ns1.vercel-dns.com` /
 * `ns2.vercel-dns.com` -- the same signal dns-watch.sh already watches for,
 * read here independently so this script does not depend on that one having
 * run first.
 *
 * @param {string} host
 */
export async function pointsAtVercel(host) {
  try {
    const ns = await resolveNs(host)
    return ns.some((n) => n.toLowerCase().includes('vercel-dns.com'))
  } catch {
    return false
  }
}

/**
 * @param {string} url
 * @param {{ redirect?: RequestRedirect }} [opts]
 */
async function get(url, { redirect = 'follow' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: 'GET', redirect, signal: controller.signal })
    const body = redirect === 'follow' ? await response.text() : ''
    return {
      ok: true,
      status: response.status,
      location: response.headers.get('location') ?? '',
      vercelId: response.headers.get('x-vercel-id') ?? '',
      body,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      location: '',
      vercelId: '',
      body: '',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The three-way exit code, kept pure so verify-cutover.test.mjs can drive
 * every branch without a network or a resolver.
 *
 * @param {{ apexResolves: boolean; pointsAtVercel: boolean }} dns
 * @param {{ httpRedirects: boolean; homeOk: boolean; healthOk: boolean; identityMatches: boolean }} behaviour
 */
export function classify(dns, behaviour) {
  if (!dns.apexResolves || !dns.pointsAtVercel) {
    return { exitCode: 2, verdict: 'not-yet-cut-over' }
  }
  const broken =
    !behaviour.httpRedirects ||
    !behaviour.homeOk ||
    !behaviour.healthOk ||
    !behaviour.identityMatches
  return broken
    ? { exitCode: 1, verdict: 'cut-over-but-broken' }
    : { exitCode: 0, verdict: 'cut-over-and-healthy' }
}

async function main() {
  console.log(
    `resolver: ${RESOLVER} (results below are true for this resolver, not necessarily every one)`,
  )

  const [apex, www] = await Promise.all([resolveHost(APEX), resolveHost(WWW)])
  console.log(`  ${APEX} -> ${apex.ok ? apex.address : `no answer (${apex.code})`}`)
  console.log(`  ${WWW} -> ${www.ok ? www.address : `no answer (${www.code})`}`)

  const apexResolves = apex.ok
  const onVercel = apexResolves && (await pointsAtVercel(APEX))
  console.log(`  nameservers name Vercel: ${onVercel ? 'yes' : 'no'}`)

  const dnsState = { apexResolves, pointsAtVercel: onVercel }

  if (!dnsState.apexResolves || !dnsState.pointsAtVercel) {
    const { exitCode, verdict } = classify(dnsState, {
      httpRedirects: false,
      homeOk: false,
      healthOk: false,
      identityMatches: false,
    })
    console.log(
      `\n${APEX} has not cut over to Vercel yet (${verdict}). This is the expected state before the DNS change; scripts/dns-watch.sh is watching for it. Exit ${exitCode}.`,
    )
    return exitCode
  }

  console.log('\nDNS points at Vercel. Checking behaviour...')

  const httpProbe = await get(`http://${APEX}/`, { redirect: 'manual' })
  const httpRedirects = httpProbe.status === 301 || httpProbe.status === 308
  console.log(
    `  http://${APEX}/ -> ${httpProbe.status}${httpProbe.location ? ` -> ${httpProbe.location}` : ''} ${httpRedirects ? 'ok' : 'FAIL (expected 301/308 to https)'}`,
  )

  const home = await get(`https://${APEX}/`)
  const homeOk = home.status === 200
  console.log(`  https://${APEX}/ -> ${home.status} ${homeOk ? 'ok' : 'FAIL'}`)

  const health = await get(`https://${APEX}/api/health`)
  let healthOk = false
  let healthDatabase = 'unknown'
  try {
    const parsed = JSON.parse(health.body || '{}')
    healthDatabase = parsed.database ?? 'unknown'
    healthOk = health.status === 200 && healthDatabase === 'ok'
  } catch {
    healthOk = false
  }
  console.log(
    `  https://${APEX}/api/health -> ${health.status}, database=${healthDatabase} ${healthOk ? 'ok' : 'FAIL'}`,
  )

  const reference = await get(`${VERCEL_REFERENCE}/api/health`)
  let referenceDatabase = 'unknown'
  try {
    referenceDatabase = JSON.parse(reference.body || '{}').database ?? 'unknown'
  } catch {
    referenceDatabase = 'unknown'
  }
  // Identity, not byte equality: two independent requests a moment apart can
  // hit different edge regions with different x-vercel-id values, and the
  // health body's own latency_ms differs by construction every time. What
  // has to agree is that BOTH sides are answered by Vercel at all (a
  // non-empty x-vercel-id on the apex) and both report the same database
  // verdict -- the same build serving both hostnames would never disagree on
  // "can I reach Supabase".
  const identityMatches = Boolean(home.vercelId) && healthDatabase === referenceDatabase
  console.log(
    `  identity: apex x-vercel-id ${home.vercelId ? 'present' : 'ABSENT'}, database verdict apex=${healthDatabase} reference=${referenceDatabase} ${identityMatches ? 'ok' : 'FAIL'}`,
  )

  const { exitCode, verdict } = classify(dnsState, {
    httpRedirects,
    homeOk,
    healthOk,
    identityMatches,
  })

  if (exitCode === 0) {
    console.log(`\n${APEX} is cut over and healthy. Exit 0.`)
  } else {
    console.log(
      `\n${APEX} resolves to Vercel but is not fully healthy (${verdict}). This is the case worth paging on. Exit 1.`,
    )
  }
  return exitCode
}

if (process.argv[1]?.endsWith('verify-cutover.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
