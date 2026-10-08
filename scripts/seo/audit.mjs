#!/usr/bin/env node
/**
 * SEO audit of a RUNNING build: what a crawler reads, checked as served.
 *
 * Usage:
 *   PORT=3311 pnpm start &
 *   LOCAL_BASE=http://localhost:3311 node scripts/seo/audit.mjs
 *   node scripts/seo/audit.mjs --base=https://kenyonexpress.co.il --paths=/,/faq
 *   node scripts/seo/audit.mjs --report=test-results/seo-audit.json
 *   node scripts/seo/audit.mjs --site=https://kenyonexpress.co.il   # the origin the build baked
 *
 * `--site` (default NEXT_PUBLIC_APP_URL, else https://kenyonexpress.co.il,
 * the same fallback as lib/site-url.ts) is the origin canonicals, og:url and
 * sitemap locs are expected to carry. A local build answers on localhost but
 * bakes the production origin into every absolute URL, so the two differ by
 * design; comparing against the fetch origin flagged all 16 pages.
 *
 * WHY A FETCH AND NOT A UNIT TEST. `public-page-metadata.test.ts` proves every
 * indexable page CALLS `publicPageMetadata`; `json-ld-validate.test.ts` proves
 * every builder EMITS a valid node. Neither sees what Next does with them:
 * the file-convention OG image that gets silently replaced, the `alternates`
 * block a layout overrides, the second `<link rel="canonical">` a component
 * adds. Those only exist in the served document, so this reads the document.
 *
 * WHAT IT CHECKS, per page:
 *   - one canonical, absolute, same origin, no query string
 *   - hreflang `he-IL` and `x-default`, both equal to the canonical
 *   - `<title>`, `<meta name="description">`, `<html lang="he" dir="rtl">`
 *   - og:title, og:description, og:url (= canonical), og:type, og:locale
 *     (he_IL), og:site_name, og:image (absolute)
 *   - twitter:card, twitter:title, twitter:description
 *   - every `application/ld+json` block parses and passes the validator
 *   - no `noindex` on a page the sitemap lists
 * Plus `/robots.txt` (a Sitemap line, the private prefixes disallowed) and
 * `/sitemap.xml` (same-origin absolute locs, hreflang on every URL, nothing a
 * robots rule disallows).
 *
 * The page list is the static indexable routes plus one of each dynamic kind
 * taken from the sitemap itself, so a catalogue change cannot make the audit
 * point at a slug that no longer exists.
 *
 * Exit 1 on any error; warnings are printed and do not fail the run.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { validateJsonLdText } from '../../src/lib/seo/json-ld-validate.mjs'

export const STATIC_PATHS = Object.freeze([
  '/',
  '/products',
  '/coupons',
  '/about',
  '/faq',
  '/help',
  '/blog',
  '/blog/how-coupons-work',
  '/contact',
  '/suppliers',
  '/gift-card',
  '/privacy-policy',
  '/terms-and-conditions',
  '/refund_returns',
  '/accessibility',
])

/** One representative per dynamic route family, picked out of the sitemap. */
const DYNAMIC_PREFIXES = Object.freeze(['/category/', '/product/', '/s/', '/city/', '/coupons/'])

/** Prefixes robots.txt must keep crawlers out of (mirrors app/robots.ts). */
export const PRIVATE_PREFIXES = Object.freeze([
  '/redeem/',
  '/coupon/',
  '/account/',
  '/supplier/',
  '/admin/',
  '/checkout',
  '/cart',
  '/auth/',
  '/api/',
])

// ---------------------------------------------------------------------------
// Parsing. Regex over the document rather than a DOM: the tags this reads are
// all void elements in <head> with no nesting, and a DOM dependency would be
// the only one this script has.
// ---------------------------------------------------------------------------

const TAG = /<(meta|link|title|html|script)\b([^>]*)>/gi
const ATTR = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function attrs(raw) {
  const out = {}
  for (const m of raw.matchAll(ATTR)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

function push(map, key, value) {
  const list = map[key] ?? []
  list.push(value)
  map[key] = list
}

/**
 * The head of a document as data.
 *
 * @param {string} html
 * @returns {{
 *   html: Record<string, string>,
 *   title: string | null,
 *   metaByName: Record<string, string[]>,
 *   metaByProperty: Record<string, string[]>,
 *   links: Array<Record<string, string>>,
 *   jsonLd: string[],
 * }}
 */
export function parseHead(html) {
  const out = {
    html: {},
    title: null,
    metaByName: {},
    metaByProperty: {},
    links: [],
    jsonLd: [],
  }
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleMatch) out.title = decodeEntities(titleMatch[1].trim())

  for (const m of html.matchAll(TAG)) {
    const tag = m[1].toLowerCase()
    const a = attrs(m[2])
    if (tag === 'html') {
      out.html = a
    } else if (tag === 'meta') {
      if (a.name) push(out.metaByName, a.name.toLowerCase(), a.content ?? '')
      if (a.property) push(out.metaByProperty, a.property.toLowerCase(), a.content ?? '')
    } else if (tag === 'link') {
      out.links.push(a)
    }
  }

  const script = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(script)) {
    const a = attrs(m[1])
    if ((a.type ?? '').toLowerCase() === 'application/ld+json') out.jsonLd.push(m[2])
  }
  return out
}

// ---------------------------------------------------------------------------
// Checks. Each returns issues; `level: 'error'` fails the run.
// ---------------------------------------------------------------------------

function issue(level, check, message) {
  return { level, check, message }
}

function sameOrigin(url, origin) {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

function isAbsolute(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Audits one served HTML document.
 *
 * @param {string} html
 * @param {{ url: string, site?: string, indexable?: boolean }} ctx the URL it was
 *   fetched from, and the origin its absolute URLs are expected to name
 * @returns {Array<{ level: 'error' | 'warning', check: string, message: string }>}
 */
export function auditDocument(html, ctx) {
  const issues = []
  const origin = ctx.site ? new URL(ctx.site).origin : new URL(ctx.url).origin
  const head = parseHead(html)

  // Language and direction. Hebrew RTL is a site-wide rule; a crawler reads
  // `lang` to pick the market and a screen reader reads `dir`.
  if ((head.html.lang ?? '').toLowerCase() !== 'he') {
    issues.push(
      issue('error', 'lang', `<html lang> is ${JSON.stringify(head.html.lang)}, want "he"`),
    )
  }
  if ((head.html.dir ?? '').toLowerCase() !== 'rtl') {
    issues.push(issue('error', 'dir', `<html dir> is ${JSON.stringify(head.html.dir)}, want "rtl"`))
  }

  if (!head.title) issues.push(issue('error', 'title', 'no <title>'))
  const description = head.metaByName.description ?? []
  if (description.length === 0 || !description[0]?.trim()) {
    issues.push(issue('error', 'description', 'no <meta name="description">'))
  } else if (description.length > 1) {
    issues.push(issue('error', 'description', `${description.length} description tags`))
  }

  // Canonical: exactly one, absolute, same origin, bare path.
  const canonicals = head.links.filter((l) => (l.rel ?? '').toLowerCase() === 'canonical')
  let canonical = null
  if (canonicals.length !== 1) {
    issues.push(issue('error', 'canonical', `${canonicals.length} canonical links, want 1`))
  } else {
    canonical = canonicals[0].href ?? ''
    if (!isAbsolute(canonical)) {
      issues.push(issue('error', 'canonical', `not absolute: ${canonical}`))
    } else if (!sameOrigin(canonical, origin)) {
      issues.push(issue('error', 'canonical', `points off-origin: ${canonical}`))
    } else if (/[?#]/.test(canonical)) {
      issues.push(issue('error', 'canonical', `carries a query or fragment: ${canonical}`))
    }
  }

  // hreflang: he-IL and x-default, both the canonical.
  const alternates = head.links.filter(
    (l) => (l.rel ?? '').toLowerCase() === 'alternate' && l.hreflang,
  )
  const byLang = Object.fromEntries(alternates.map((l) => [l.hreflang, l.href]))
  for (const lang of ['he-IL', 'x-default']) {
    const href = byLang[lang]
    if (!href) issues.push(issue('error', 'hreflang', `no hreflang="${lang}"`))
    else if (canonical && href !== canonical) {
      issues.push(issue('error', 'hreflang', `${lang} is ${href}, canonical is ${canonical}`))
    }
  }
  const langCounts = alternates.reduce((acc, l) => {
    acc[l.hreflang] = (acc[l.hreflang] ?? 0) + 1
    return acc
  }, {})
  for (const [lang, count] of Object.entries(langCounts)) {
    if (count > 1)
      issues.push(issue('error', 'hreflang', `hreflang="${lang}" appears ${count} times`))
  }

  // Open Graph.
  const og = (key) => head.metaByProperty[`og:${key}`] ?? []
  for (const key of ['title', 'description', 'type', 'locale', 'site_name', 'url', 'image']) {
    const values = og(key)
    if (values.length === 0 || !values[0]?.trim()) {
      issues.push(issue('error', 'open-graph', `no og:${key}`))
    } else if (values.length > 1 && key !== 'image') {
      issues.push(issue('error', 'open-graph', `og:${key} appears ${values.length} times`))
    }
  }
  if (og('locale')[0] && og('locale')[0] !== 'he_IL') {
    issues.push(issue('error', 'open-graph', `og:locale is ${og('locale')[0]}, want he_IL`))
  }
  if (og('url')[0] && canonical && og('url')[0] !== canonical) {
    issues.push(
      issue('error', 'open-graph', `og:url ${og('url')[0]} differs from canonical ${canonical}`),
    )
  }
  for (const image of og('image')) {
    if (!isAbsolute(image))
      issues.push(issue('error', 'open-graph', `og:image not absolute: ${image}`))
  }

  // Twitter card.
  const tw = (key) => head.metaByName[`twitter:${key}`] ?? []
  for (const key of ['card', 'title', 'description']) {
    if (tw(key).length === 0 || !tw(key)[0]?.trim()) {
      issues.push(issue('error', 'twitter', `no twitter:${key}`))
    }
  }
  if (tw('card')[0] && !['summary', 'summary_large_image'].includes(tw('card')[0])) {
    issues.push(issue('error', 'twitter', `twitter:card is ${tw('card')[0]}`))
  }
  if (tw('image').length === 0) {
    issues.push(issue('warning', 'twitter', 'no twitter:image; the card falls back to og:image'))
  }

  // Robots.
  const robots = (head.metaByName.robots ?? []).join(',').toLowerCase()
  if (ctx.indexable !== false && /noindex/.test(robots)) {
    issues.push(issue('error', 'robots', `indexable page carries noindex (${robots})`))
  }

  // Structured data.
  if (head.jsonLd.length === 0) {
    issues.push(issue('warning', 'json-ld', 'no structured data on this page'))
  }
  head.jsonLd.forEach((text, index) => {
    const { nodes, issues: found } = validateJsonLdText(text)
    const types = nodes.map((n) => (n && typeof n === 'object' ? n['@type'] : '?')).join(',')
    for (const f of found) {
      issues.push(
        issue(
          f.level,
          'json-ld',
          `block ${index + 1} (${types || 'unparsed'}) ${f.path}: ${f.message}`,
        ),
      )
    }
  })

  return issues
}

/**
 * @param {string} text the body of /robots.txt
 * @param {{ origin: string }} ctx
 */
export function auditRobotsTxt(text, ctx) {
  const issues = []
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const sitemaps = lines.filter((l) => /^sitemap:/i.test(l)).map((l) => l.slice(8).trim())
  if (sitemaps.length === 0) issues.push(issue('error', 'robots.txt', 'no Sitemap: line'))
  for (const s of sitemaps) {
    if (!sameOrigin(s, ctx.origin))
      issues.push(issue('error', 'robots.txt', `Sitemap off-origin: ${s}`))
  }
  const disallowed = lines.filter((l) => /^disallow:/i.test(l)).map((l) => l.slice(9).trim())
  for (const prefix of PRIVATE_PREFIXES) {
    if (!disallowed.includes(prefix)) {
      issues.push(issue('error', 'robots.txt', `missing Disallow: ${prefix}`))
    }
  }
  if (disallowed.includes('/'))
    issues.push(issue('error', 'robots.txt', 'Disallow: / blocks the whole site'))
  return { issues, disallowed }
}

/**
 * @param {string} xml the body of /sitemap.xml
 * @param {{ origin: string, disallowed?: string[] }} ctx
 * @returns {{ issues: Array<object>, urls: string[] }}
 */
export function auditSitemapXml(xml, ctx) {
  const issues = []
  const urls = []
  if (!/<urlset\b/.test(xml)) {
    issues.push(issue('error', 'sitemap', 'no <urlset> (not a sitemap, or a sitemap index)'))
    return { issues, urls }
  }
  const disallowed = ctx.disallowed ?? []
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? []
  if (blocks.length === 0) issues.push(issue('error', 'sitemap', 'no <url> entries'))
  const seen = new Set()
  for (const block of blocks) {
    const loc = decodeEntities(/<loc>([\s\S]*?)<\/loc>/.exec(block)?.[1]?.trim() ?? '')
    if (!loc) {
      issues.push(issue('error', 'sitemap', 'entry without <loc>'))
      continue
    }
    urls.push(loc)
    if (seen.has(loc)) issues.push(issue('error', 'sitemap', `duplicate loc ${loc}`))
    seen.add(loc)
    if (!sameOrigin(loc, ctx.origin))
      issues.push(issue('error', 'sitemap', `off-origin loc ${loc}`))
    const path = new URL(loc, ctx.origin).pathname
    for (const prefix of disallowed) {
      if (prefix && path.startsWith(prefix)) {
        issues.push(
          issue('error', 'sitemap', `${loc} is listed but robots.txt disallows ${prefix}`),
        )
      }
    }
    const langs = Object.fromEntries(
      [...block.matchAll(/<xhtml:link\b([^>]*)\/?>/g)].map((m) => {
        const a = attrs(m[1])
        return [a.hreflang, a.href]
      }),
    )
    for (const lang of ['he-IL', 'x-default']) {
      if (!langs[lang]) issues.push(issue('error', 'sitemap', `${loc} has no hreflang="${lang}"`))
      else if (langs[lang] !== loc) {
        issues.push(issue('error', 'sitemap', `${loc} hreflang ${lang} points at ${langs[lang]}`))
      }
    }
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/.exec(block)?.[1]?.trim()
    if (lastmod && Number.isNaN(Date.parse(lastmod))) {
      issues.push(issue('error', 'sitemap', `${loc} lastmod is not a date: ${lastmod}`))
    }
  }
  if (blocks.length > 50_000)
    issues.push(issue('error', 'sitemap', `${blocks.length} URLs; the cap is 50,000`))
  return { issues, urls }
}

/**
 * The static paths plus one URL per dynamic family found in the sitemap.
 *
 * @param {string[]} sitemapUrls
 * @param {string} origin
 */
export function pickPaths(sitemapUrls, origin) {
  const paths = [...STATIC_PATHS]
  for (const prefix of DYNAMIC_PREFIXES) {
    const hit = sitemapUrls.find((u) => new URL(u, origin).pathname.startsWith(prefix))
    if (hit) paths.push(new URL(hit, origin).pathname)
  }
  return [...new Set(paths)]
}

// ---------------------------------------------------------------------------
// Runner.
// ---------------------------------------------------------------------------

function arg(name) {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      // A crawler UA so Next serves metadata in <head> rather than streaming
      // it, which is what every real crawler gets.
      'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'manual',
  })
  return { status: res.status, text: await res.text(), location: res.headers.get('location') }
}

async function main() {
  const base = (arg('base') ?? process.env.LOCAL_BASE ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  )
  const site = arg('site') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const origin = new URL(site).origin
  const report = {
    base,
    site,
    startedAt: new Date().toISOString(),
    paths: [],
    pages: [],
    robots: [],
    sitemap: [],
  }

  const robotsRes = await fetchText(`${base}/robots.txt`)
  const robots = auditRobotsTxt(robotsRes.status === 200 ? robotsRes.text : '', { origin })
  if (robotsRes.status !== 200)
    robots.issues.unshift(issue('error', 'robots.txt', `HTTP ${robotsRes.status}`))
  report.robots = robots.issues

  const sitemapRes = await fetchText(`${base}/sitemap.xml`)
  const sitemap = auditSitemapXml(sitemapRes.status === 200 ? sitemapRes.text : '', {
    origin,
    disallowed: robots.disallowed,
  })
  if (sitemapRes.status !== 200)
    sitemap.issues.unshift(issue('error', 'sitemap', `HTTP ${sitemapRes.status}`))
  report.sitemap = sitemap.issues

  const explicit = arg('paths')
  const paths = explicit
    ? explicit.split(',').map((p) => p.trim())
    : pickPaths(sitemap.urls, origin)
  report.paths = paths

  for (const path of paths) {
    const url = `${base}${path}`
    const res = await fetchText(url)
    const entry = { path, status: res.status, issues: [] }
    if (res.status !== 200) {
      entry.issues.push(
        issue('error', 'http', `HTTP ${res.status}${res.location ? ` -> ${res.location}` : ''}`),
      )
    } else {
      entry.issues = auditDocument(res.text, { url, site })
    }
    report.pages.push(entry)
  }

  const all = [
    ...report.robots.map((i) => ({ where: '/robots.txt', ...i })),
    ...report.sitemap.map((i) => ({ where: '/sitemap.xml', ...i })),
    ...report.pages.flatMap((p) => p.issues.map((i) => ({ where: p.path, ...i }))),
  ]
  const errors = all.filter((i) => i.level === 'error')
  const warnings = all.filter((i) => i.level === 'warning')

  const lines = []
  lines.push(`seo audit against ${base} (site origin ${origin})`)
  lines.push(
    `robots.txt: ${report.robots.length === 0 ? 'ok' : `${report.robots.length} issue(s)`}`,
  )
  lines.push(
    `sitemap.xml: ${sitemap.urls.length} urls, ${report.sitemap.length === 0 ? 'ok' : `${report.sitemap.length} issue(s)`}`,
  )
  for (const p of report.pages) {
    const e = p.issues.filter((i) => i.level === 'error').length
    const w = p.issues.filter((i) => i.level === 'warning').length
    lines.push(
      `${String(p.status).padEnd(4)} ${p.path.padEnd(40)} ${e === 0 ? 'ok' : `${e} error(s)`}${w ? `, ${w} warning(s)` : ''}`,
    )
  }
  for (const i of all) lines.push(`  [${i.level}] ${i.where} ${i.check}: ${i.message}`)
  lines.push(`${errors.length} error(s), ${warnings.length} warning(s)`)
  process.stdout.write(`${lines.join('\n')}\n`)

  const out = resolve(arg('report') ?? 'test-results/seo-audit.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(
    out,
    `${JSON.stringify({ ...report, errors: errors.length, warnings: warnings.length }, null, 2)}\n`,
  )
  process.stdout.write(`report: ${out}\n`)

  process.exitCode = errors.length === 0 ? 0 : 1
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
