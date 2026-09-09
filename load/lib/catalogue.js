import http from 'k6/http'

/**
 * Real URLs, taken from the running target's own sitemap.
 *
 * The alternative -- a hardcoded slug list -- is how a load test comes back
 * green having measured nothing: /product/<stale-slug> is a 404, and a 404 is
 * fast, cached and cheap. Every perf probe in scripts/ has hit that once. The
 * sitemap is generated from `products where status = 'active'` (src/app/
 * sitemap.ts), so it cannot drift from what a shopper can actually open.
 *
 * The floor below is the second half of the same lesson: [14] found
 * `redirect_coverage` passing 76/76 because it was counting a subset it had
 * silently reduced to nothing. A run against an empty catalogue must fail
 * loudly at setup, not report a beautiful p95 for four static pages.
 *
 * IT FOLLOWS A SITEMAP INDEX, AND UNTIL 2026-09-10 IT DID NOT.
 * `/sitemap.xml` used to be a flat list of page URLs. It is now a
 * `<sitemapindex>` naming five section files, so the old one-request read
 * found five `<loc>` bodies, none of them a product, and every scenario that
 * calls this died in `setup()` with "sitemap lists 0 products". Measured on
 * 2026-09-10 against a local `pnpm start`: browse, search, pool and mixed --
 * four of the six scenarios -- could not start at all, and the results in
 * docs/LOAD-TEST-RESULTS.md were taken before the split.
 *
 * That failure was loud, which is the only reason it is a paragraph and not an
 * incident: the floor above turned a silently empty run into an abort. It is
 * also why the fetch below is not "try the index, fall back to flat" -- a
 * fallback would have made this drift produce a small green run instead.
 */

const MIN_PRODUCTS = 10
const MIN_CATEGORIES = 1

/** `<loc>` bodies, rebased onto the target host: the sitemap prints canonical
 *  absolute URLs (NEXT_PUBLIC_APP_URL), which is not where we are pointing. */
function paths(xml) {
  const found = xml.match(/<loc>[^<]+<\/loc>/g) ?? []
  return found.map((loc) => {
    const url = loc.slice(5, -6).trim()
    const match = /^https?:\/\/[^/]+(\/.*)?$/.exec(url)
    return match ? (match[1] ?? '/') : url
  })
}

/** One document's `<loc>` bodies, or a thrown error naming the status. */
function fetchLocs(url) {
  const res = http.get(url)
  if (res.status !== 200) {
    throw new Error(`${url} returned ${res.status} -- is the server up?`)
  }
  return { body: res.body, locs: paths(res.body) }
}

export function catalogue(base) {
  const index = fetchLocs(`${base}/sitemap.xml`)

  // A `<sitemapindex>` names section files; a `<urlset>` names pages. Decided
  // on the ROOT ELEMENT and not on "did we find any products", so a section
  // file that has gone empty is still an abort rather than a quiet re-read.
  const isIndex = index.body.includes('<sitemapindex')
  const all = isIndex
    ? index.locs.flatMap((section) => fetchLocs(`${base}${section}`).locs)
    : index.locs

  if (isIndex && index.locs.length === 0) {
    throw new Error(`${base}/sitemap.xml is an index naming no sections`)
  }
  const products = all.filter((p) => p.startsWith('/product/'))
  const categories = all.filter((p) => p.startsWith('/category/'))

  if (products.length < MIN_PRODUCTS) {
    throw new Error(
      `sitemap lists ${products.length} products, need at least ${MIN_PRODUCTS}. A load run over an empty catalogue measures the 404 path.`,
    )
  }
  if (categories.length < MIN_CATEGORIES) {
    throw new Error(`sitemap lists no categories; expected at least ${MIN_CATEGORIES}`)
  }

  return { products, categories, total: all.length }
}

/** Per-VU pick. k6 seeds Math.random per VU, so VUs do not walk in lockstep. */
export function sample(list) {
  return list[Math.floor(Math.random() * list.length)]
}
