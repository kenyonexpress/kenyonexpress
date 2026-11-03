#!/usr/bin/env node
/**
 * C180: verify the SEO surface on a SERVED build, not in unit tests.
 *
 *   LOCAL_BASE=http://localhost:3317 node scripts/seo-verify.mjs
 *
 * Per page: the JSON-LD @types present, og:title / og:image, twitter:card /
 * twitter:title / twitter:image. Then robots.txt, sitemap.xml, and the status
 * and Location of every old WordPress path. Exit 1 on any miss.
 *
 * A unit test cannot see the metadata merge (a page-level openGraph drops the
 * root card), which is why this reads the HTML the server actually sends.
 */
const BASE = (process.env.LOCAL_BASE || 'http://localhost:3317').replace(/\/$/, '')
let failures = 0
const fail = (msg) => {
  failures++
  console.log(`  FAIL ${msg}`)
}

async function get(path, init = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...init })
  return { status: res.status, location: res.headers.get('location'), text: await res.text() }
}

function meta(html, attr, key) {
  const re = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`, 'i')
  return html.match(re)?.[1] ?? null
}

function ldTypes(html) {
  const types = []
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    const raw = m[1].replace(/\\u003c/g, '<')
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') {
        if (n['@type'] && n['@context']) types.push(n['@type'])
        if (n['@graph']) walk(n['@graph'])
      }
    }
    walk(JSON.parse(raw))
  }
  return types
}

// Real slugs, read from the served sitemap rather than hard-coded.
const sitemap = await get('/sitemap.xml')
const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)
const pick = (prefix) => locs.find((p) => p.startsWith(prefix) && p.length > prefix.length)

const PAGES = [
  ['/', ['Organization', 'WebSite']],
  [pick('/product/'), ['Product', 'BreadcrumbList']],
  ['/c', ['BreadcrumbList']],
  [pick('/c/'), ['BreadcrumbList']],
  [pick('/category/'), ['BreadcrumbList']],
  ['/faq', ['FAQPage']],
]

for (const [path, want] of PAGES) {
  if (!path) {
    fail(`no sitemap entry for ${want.join('+')} page`)
    continue
  }
  const { status, text } = await get(path)
  const types = ldTypes(text)
  const og = {
    title: meta(text, 'property', 'og:title'),
    image: meta(text, 'property', 'og:image'),
  }
  const tw = {
    card: meta(text, 'name', 'twitter:card'),
    title: meta(text, 'name', 'twitter:title'),
    image: meta(text, 'name', 'twitter:image'),
  }
  console.log(`${status} ${decodeURIComponent(path)}`)
  console.log(`  ld+json: ${types.join(', ') || '(none)'}`)
  console.log(`  og:title=${og.title} | og:image=${og.image}`)
  console.log(`  twitter:card=${tw.card} | twitter:title=${tw.title} | twitter:image=${tw.image}`)
  if (status !== 200) fail(`${path} status ${status}`)
  for (const t of want) if (!types.includes(t)) fail(`${path} missing ${t}`)
  if (!og.title || !og.image) fail(`${path} og:title/og:image missing`)
  if (tw.card !== 'summary_large_image' || !tw.title || !tw.image)
    fail(`${path} twitter card incomplete`)
}

const robots = await get('/robots.txt')
console.log(`\n${robots.status} /robots.txt`)
console.log(
  robots.text
    .split('\n')
    .filter((l) => /^(User-agent|Sitemap|Allow)/i.test(l))
    .map((l) => `  ${l}`)
    .join('\n'),
)
if (robots.status !== 200 || !/Sitemap:/i.test(robots.text)) fail('robots.txt has no Sitemap line')

console.log(`\n${sitemap.status} /sitemap.xml  urls=${locs.length}`)
for (const prefix of ['/product/', '/category/', '/c/', '/blog', '/faq']) {
  console.log(`  ${prefix}: ${locs.filter((p) => p.startsWith(prefix)).length}`)
}
if (sitemap.status !== 200 || locs.length === 0) fail('sitemap empty')

// The old site's URLs end in `/`. Next answers those with its own 308 to the
// slash-less path first, then the proxy's 301 moves it, so a real WordPress
// link is a two-hop chain. Every hop must be permanent, the hop that changes
// the path must be a 301, and the chain must end on a page.
const LEGACY = [
  '/shop',
  '/shop/',
  '/my-account/',
  '/contact-us/',
  '/about-us/',
  '/home/',
  '/cart-2/',
  '/checkout-2/',
  '/terms-and-conditions',
  '/terms-and-conditions/',
  '/privacy-policy/',
  '/refund_returns/',
  '/cancellation-policy/',
  '/product-category/electronics',
  '/product-category/electronics/',
  '/product-tag/sale/',
]
const strip = (p) => p.replace(/(.)\/$/, '$1')
console.log('\nold WordPress paths:')
for (const start of LEGACY) {
  const hops = []
  let path = start
  let res = await get(path)
  // Judged up to the 301 only: what the target does next (an auth gate's 307
  // on /account) is that page's own behaviour, not part of the move.
  while (res.location && hops.length < 5 && !hops.some((h) => h.startsWith('301'))) {
    hops.push(`${res.status} ${path}`)
    const next = new URL(res.location, BASE)
    if (![301, 308].includes(res.status)) fail(`${path} hop ${res.status} is not permanent`)
    if (strip(next.pathname) !== strip(path) && res.status !== 301) {
      fail(`${path} moved with ${res.status}, want 301`)
    }
    path = next.pathname + next.search
    res = await get(path, { method: 'HEAD' })
  }
  console.log(`  ${hops.join(' -> ')} -> ${res.status} ${decodeURIComponent(path)}`)
  if (!hops.some((h) => h.startsWith('301'))) fail(`${start} has no 301 hop`)
  if (res.status >= 500) fail(`${start} ends on ${res.status}`)
}

console.log(failures ? `\nSEO VERIFY: ${failures} failure(s)` : '\nSEO VERIFY: all checks pass')
process.exit(failures ? 1 : 0)
