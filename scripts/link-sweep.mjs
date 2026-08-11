/**
 * Launch-readiness link sweep.
 *
 * Two passes, because they catch different failures:
 *   1. every URL the sitemap advertises -- a 404 here is a URL handed to Google
 *   2. every internal href rendered on those pages -- a 404 here is a dead link
 *      a customer can click
 *
 * localhost, not 127.0.0.1: server actions are origin-checked and the two are
 * not the same origin to Next.
 */
import { readFileSync } from 'node:fs'

const BASE = process.env.LOCAL_BASE ?? 'http://localhost:3311'
const PROD = 'https://kenyonexpress.co.il'
const CONCURRENCY = 8

const sitemap = readFileSync(process.argv[2], 'utf8')
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(PROD, ''))
  .map((p) => (p === '' ? '/' : p))

async function head(path) {
  const url = `${BASE}${path}`
  try {
    // GET, not HEAD: a Next route can answer HEAD from a different code path,
    // and what a crawler and a customer both do is GET.
    const res = await fetch(url, { redirect: 'manual' })
    return { path, status: res.status, location: res.headers.get('location') ?? '' }
  } catch (err) {
    return { path, status: 0, error: String(err?.cause?.code ?? err.message) }
  }
}

async function pool(items, fn) {
  const out = []
  let i = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) out.push(await fn(items[i++]))
    }),
  )
  return out
}

console.log(`PASS 1 — ${sitemapPaths.length} sitemap URLs`)
const pass1 = await pool(sitemapPaths, head)
const bad1 = pass1.filter((r) => r.status >= 400 || r.status === 0)
console.log(`  ok: ${pass1.length - bad1.length}   broken: ${bad1.length}`)
for (const r of bad1) console.log(`  ${String(r.status).padStart(3)}  ${r.path}  ${r.error ?? ''}`)

// Pass 2: harvest hrefs from a sample of pages that actually render navigation.
const sample = [
  '/',
  '/products',
  '/coupons',
  '/faq',
  '/contact',
  ...sitemapPaths.filter((p) => p.startsWith('/product/')).slice(0, 5),
  ...sitemapPaths.filter((p) => p.startsWith('/category/')).slice(0, 5),
]
const hrefs = new Set()
for (const p of [...new Set(sample)]) {
  try {
    const html = await (await fetch(`${BASE}${p}`)).text()
    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const h = m[1]
      if (h.startsWith('/_next') || h.startsWith('/api/')) continue
      hrefs.add(h === '' ? '/' : h)
    }
  } catch {}
}
const toCheck = [...hrefs].filter((h) => !sitemapPaths.includes(h))
console.log(`\nPASS 2 — ${toCheck.length} distinct internal hrefs not already in the sitemap`)
const pass2 = await pool(toCheck, head)
const bad2 = pass2.filter((r) => r.status >= 400 || r.status === 0)
console.log(`  ok: ${pass2.length - bad2.length}   broken: ${bad2.length}`)
for (const r of bad2.sort((a, b) => a.path.localeCompare(b.path))) {
  console.log(`  ${String(r.status).padStart(3)}  ${r.path}  ${r.error ?? ''}`)
}

const redirects = [...pass1, ...pass2].filter((r) => r.status >= 300 && r.status < 400)
if (redirects.length) {
  console.log(`\nREDIRECTS (${redirects.length})`)
  for (const r of redirects) console.log(`  ${r.status}  ${r.path} -> ${r.location}`)
}

console.log(`\nTOTAL broken: ${bad1.length + bad2.length}`)
process.exit(bad1.length + bad2.length > 0 ? 1 : 0)
