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

/**
 * EVERY TAG THAT NAMES A HOST, DISCOVERED RATHER THAN LISTED.
 *
 * The first version of this script checked three declarations - rel=canonical,
 * robots Host, robots Sitemap - while calling the finding "every canonical the
 * site declares". Measured 2026-09-08 against the built home page, there are
 * five, and `og:url` was named in the write-up and never in the code:
 *
 *   rel="canonical"                       apex
 *   rel="alternate" hrefLang="he-IL"      apex
 *   og:url                                apex
 *   twitter:image                         apex
 *   robots.txt Host and Sitemap           apex
 *
 * Listing them would have the same failure again the next time a tag is added,
 * so this reads the document: any absolute http(s) URL sitting in an `href` or
 * `content` on a `<link>` or `<meta>` in the head is a declaration.
 *
 * CASE-INSENSITIVE ON PURPOSE. React serialises the prop as `hrefLang`, and it
 * appears in the HTML that way. HTML attribute names are case-insensitive so
 * crawlers read it correctly, and a case-sensitive grep for `hreflang=` finds
 * nothing - which is exactly the wrong answer this file exists to avoid.
 */
export function hostDeclarations(html) {
  const head = html.slice(0, html.search(/<\/head>/i) + 1 || html.length)
  const out = []
  for (const tag of head.matchAll(/<(?:link|meta)\s[^>]*>/gi)) {
    const el = tag[0]
    const url = el.match(/(?:href|content)=["'](https?:\/\/[^"']+)["']/i)
    if (!url) continue
    const label =
      el.match(/rel=["']([^"']+)["']/i)?.[1] ??
      el.match(/(?:property|name)=["']([^"']+)["']/i)?.[1] ??
      'link'
    const lang = el.match(/hreflang=["']([^"']+)["']/i)?.[1]
    out.push({ label: lang ? `${label} ${lang}` : label, url: url[1] })
  }
  return out
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

  // A NON-2xx IS NOT A PAGE WITHOUT A CANONICAL, AND THE DIFFERENCE IS THE
  // WHOLE POINT OF THIS SCRIPT.
  //
  // Measured 2026-09-08: after enough probing from one client, the custom
  // domain began answering 403 with Vercel's Security Checkpoint - a 32 KB
  // interstitial carrying no rel=canonical. This block caught only network
  // errors, so it parsed the challenge, found no canonical, and printed "the
  // page declares no canonical host at all". That reads as a finding about the
  // site. It was a finding about not having seen the site.
  //
  // The alias kenyonexpress.vercel.app answered 200 at the same moment, so the
  // protection sits on the custom domain and the cron scheduler, which uses the
  // alias, is unaffected. The challenge expired on its own within the hour.
  let html
  let robots
  try {
    const page = await fetch(base, { signal: AbortSignal.timeout(25_000) })
    if (!page.ok) {
      console.error(`audit-canonical-host: ${base} answered ${page.status}, not a page.`)
      console.error('Nothing can be concluded about its canonical host from that.')
      process.exit(2)
    }
    html = await page.text()
    const robotsRes = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(25_000) })
    robots = robotsRes.ok ? await robotsRes.text() : ''
  } catch (error) {
    console.error(`audit-canonical-host: ${base} did not answer (${error}). Nothing checked.`)
    process.exit(2)
  }

  const { host, sitemap } = robotsHosts(robots)
  const declared = [
    ...hostDeclarations(html).map((d) => [d.label, d.url]),
    ['robots Host', host],
    ['robots Sitemap', sitemap],
  ].filter(([, value]) => value)

  if (declared.length === 0) {
    // Reached only for a 2xx page that genuinely declares nothing, which IS a
    // finding. A non-2xx exits 2 above and never arrives here.
    console.error('audit-canonical-host: the page answered 2xx and declares no canonical host.')
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
