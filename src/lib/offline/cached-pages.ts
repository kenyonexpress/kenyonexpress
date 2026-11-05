/**
 * What the offline page can list without a network: the browse pages the
 * service worker has already stored (`public/sw.js`, `PAGES_CACHE`, product,
 * category and catalogue documents visited in this session or earlier). Pure
 * over a list of cached request URLs so it can be tested; the component
 * supplies them from the Cache API.
 */
export type CachedPageLink = {
  href: string
  label: string
  kind: 'product' | 'category' | 'catalogue'
}

const KINDS: { prefix: string; kind: CachedPageLink['kind'] }[] = [
  { prefix: '/product/', kind: 'product' },
  { prefix: '/category/', kind: 'category' },
]

/** A readable label out of a slug: decoded, dashes to spaces, nothing invented. */
export function labelFromSlug(slug: string): string {
  let decoded = slug
  try {
    decoded = decodeURIComponent(slug)
  } catch {
    // A malformed percent sequence stays as typed; the link still works.
  }
  return decoded.replace(/[-_]+/g, ' ').trim()
}

/** Newest first is the cache's insertion order reversed; duplicates collapse on href. */
export function cachedPageLinks(
  urls: readonly string[],
  origin: string,
  max = 12,
): CachedPageLink[] {
  const out: CachedPageLink[] = []
  const seen = new Set<string>()
  for (let i = urls.length - 1; i >= 0 && out.length < max; i -= 1) {
    let url: URL
    try {
      url = new URL(urls[i] as string, origin)
    } catch {
      continue
    }
    if (url.origin !== origin || url.search !== '') continue
    const path = url.pathname
    if (seen.has(path)) continue
    if (path === '/products') {
      seen.add(path)
      out.push({ href: path, label: '', kind: 'catalogue' })
      continue
    }
    const hit = KINDS.find((k) => path.startsWith(k.prefix) && path.length > k.prefix.length)
    if (!hit) continue
    const slug = path.slice(hit.prefix.length).replace(/\/+$/, '')
    if (!slug || slug.includes('/')) continue
    seen.add(path)
    out.push({ href: path, label: labelFromSlug(slug), kind: hit.kind })
  }
  return out
}
