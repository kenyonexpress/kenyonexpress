#!/usr/bin/env node
/**
 * DOES THE HOST THE SITE CALLS CANONICAL ACTUALLY SERVE THE SITE?
 *
 * Measured 2026-09-08 against production, and the answer was no. Every
 * declaration in the app names the apex:
 *
 *   robots.txt          Host: https://kenyonexpress.co.il
 *   robots.txt          Sitemap: https://kenyonexpress.co.il/sitemap.xml
 *   sitemap.xml         every <loc> on the apex
 *   <link rel=canonical> https://kenyonexpress.co.il
 *   og:url               https://kenyonexpress.co.il
 *
 * and the apex answers **308 -> https://www.kenyonexpress.co.il**. So every URL
 * the site declares canonical is a URL that redirects away from itself. A
 * crawler resolves the chain and indexes `www`, which means the effective
 * canonical is the one the code does NOT name, and the code's opinion is
 * silently overridden by a DNS-level setting.
 *
 * WHY A SEPARATE AUDIT AND NOT A UNIT TEST. Nothing in the repository can see
 * this. `src/lib/site-url.ts` reads `NEXT_PUBLIC_APP_URL` and falls back to the
 * apex, and that fallback is correct in isolation - the string is well formed,
 * the metadata builds, every existing SEO test passes. The defect only exists
 * in the relationship between what the build declares and what the domain
 * configuration does, and only one of those lives here.
 *
 * WHICH WAY TO FIX IT IS NOT THIS SCRIPT'S CALL. Either set
 * NEXT_PUBLIC_APP_URL to the `www` host, or make the apex primary at the
 * platform. That is a branding decision. The inconsistency is a defect either
 * way, and this reports it rather than choosing.
 *
 *   node scripts/audit-canonical-host.mjs
 *   BASE=https://www.example.com node scripts/audit-canonical-host.mjs
 */

export const DEFAULT_BASE = 'https://www.kenyonexpress.co.il'

/** The href of the first rel=canonical link, or null. */
export function canonicalFrom(html) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)
  if (!match) return null
  const href = match[0].match(/href=["']([^"']+)["']/i)
  return href ? href[1] : null
}

/** `Host:` and `Sitemap:` as robots.txt declares them. */
export function robotsHosts(robots) {
  const host = robots.match(/^Host:\s*(\S+)/im)
  const sitemap = robots.match(/^Sitemap:\s*(\S+)/im)
  return { host: host ? host[1] : null, sitemap: sitemap ? sitemap[1] : null }
}

export function originOf(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** A declared origin is honest only if it serves rather than redirecting away. */
export function isSelfServing(status, location, declaredOrigin) {
  if (status >= 200 && status < 300) return true
  if (!location) return false
  return originOf(location) === declaredOrigin
}

async function head(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  return { status: res.status, location: res.headers.get('location') }
}

async function main() {
  const base = process.env.BASE ?? DEFAULT_BASE

  let html
  let robots
  try {
    html = await (await fetch(base, { signal: AbortSignal.timeout(25_000) })).text()
    robots = await (
      await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(25_000) })
    ).text()
  } catch (error) {
    console.error(`audit-canonical-host: ${base} did not answer (${error}). Nothing checked.`)
    process.exit(2)
  }

  const canonical = canonicalFrom(html)
  const { host, sitemap } = robotsHosts(robots)
  const declared = [
    ['rel=canonical', canonical],
    ['robots Host', host],
    ['robots Sitemap', sitemap],
  ].filter(([, value]) => value)

  if (declared.length === 0) {
    console.error('audit-canonical-host: the page declares no canonical host at all.')
    process.exit(1)
  }

  console.log(`served from ${base}\n`)
  let bad = 0
  for (const [label, value] of declared) {
    const origin = originOf(value)
    const probe = await head(origin ?? value).catch(() => ({ status: 0, location: null }))
    const ok = isSelfServing(probe.status, probe.location, origin)
    if (!ok) bad += 1
    console.log(
      `  ${ok ? 'ok    ' : 'REDIRECTS'}  ${label.padEnd(15)} ${value}`.trimEnd() +
        (ok ? '' : `\n              ${probe.status} -> ${probe.location}`),
    )
  }

  if (bad > 0) {
    console.log(
      '\nA declared canonical that redirects away is overridden by the redirect.\nThe host configuration wins, and the opinion in the code is not the one indexed.',
    )
  }
  process.exit(bad > 0 ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
