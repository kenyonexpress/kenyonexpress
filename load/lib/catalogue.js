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

export function catalogue(base) {
  const res = http.get(`${base}/sitemap.xml`)
  if (res.status !== 200) {
    throw new Error(`sitemap.xml returned ${res.status} from ${base} -- is the server up?`)
  }

  const all = paths(res.body)
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
