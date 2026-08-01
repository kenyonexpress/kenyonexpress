/**
 * The ONE list of hosts an image may be served from, read by three callers that
 * used to disagree.
 *
 * `next/image` refuses a remote host that is not in `images.remotePatterns` by
 * THROWING during render, which means a 500 on the page - not a broken image, a
 * blank page. The admin forms that write image URLs took free text, so a URL
 * pasted from anywhere else was accepted, stored, and only failed later on a
 * customer-facing page. `products.images` had no validation at all and feeds
 * the homepage deal cards and the product page.
 *
 * A raw `<img>` is not the escape hatch it looks like either: the CSP's
 * `img-src` allows only self, data, blob, Supabase and Unsplash, so a raw tag
 * pointed at any other host renders a BROKEN IMAGE with a console violation and
 * nothing else. That is the [18] finding, and it is why everything here goes
 * through the optimizer: `/_next/image` is same-origin, so `'self'` covers it
 * whatever the upstream host is.
 *
 * So the allowlist has to be enforced where the URL ENTERS the system. This
 * module is that gate, and `next.config.ts` builds `remotePatterns` from the
 * same array, so the two can never drift.
 *
 * Client-safe: no node built-ins, no sharp. `validate.ts` next door has the
 * same constraint.
 */

/** Shape of a `next.config.ts` `images.remotePatterns` entry. */
export type RemoteImagePattern = { protocol: 'https'; hostname: string }

export const REMOTE_IMAGE_PATTERNS: readonly RemoteImagePattern[] = [
  // Supabase Storage: everything the image pipeline uploads.
  { protocol: 'https', hostname: '*.supabase.co' },
  { protocol: 'https', hostname: 'images.unsplash.com' },
  { protocol: 'https', hostname: 'plus.unsplash.com' },
  // Seed/demo product images (024_seed_demo_products). Without this host in the
  // allowlist, next/image throws and every demo product page 500s.
  { protocol: 'https', hostname: 'picsum.photos' },
  // R2 public CDN (image pipeline renditions)
  { protocol: 'https', hostname: '*.kenyonexpress.co.il' },
  { protocol: 'https', hostname: '*.r2.dev' },
] as const

/**
 * `*` in a remotePattern hostname matches EXACTLY ONE label, next's rule and
 * not a glob: `*.supabase.co` matches `abc.supabase.co` and does not match
 * `supabase.co` or `a.b.supabase.co`. Getting this wrong in the permissive
 * direction would let `evil.com/x.supabase.co` style hosts through the gate and
 * then be rejected by next itself, which is the failure this module exists to
 * prevent.
 */
export function hostnameMatches(hostname: string, pattern: string): boolean {
  if (!pattern.includes('*')) return hostname === pattern
  const [, rest] = pattern.split('*.', 2)
  if (!rest) return false
  if (!hostname.endsWith(`.${rest}`)) return false
  const label = hostname.slice(0, hostname.length - rest.length - 1)
  return label.length > 0 && !label.includes('.')
}

/**
 * True for a value `next/image` can render without throwing.
 *
 * Accepts a same-origin path (`/images/x.webp`), which needs no allowlist, and
 * an https URL on an allowlisted host. Everything else is false, including
 * http, protocol-relative `//host/x`, and `data:` - the optimizer rejects all
 * three, and a data URL belongs in a raw `<img>` (the voucher QR) rather than
 * in a column.
 */
export function isAllowedImageUrl(value: string | null | undefined): boolean {
  const raw = (value ?? '').trim()
  if (!raw) return false
  if (raw.startsWith('//')) return false
  if (raw.startsWith('/')) return true
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return REMOTE_IMAGE_PATTERNS.some((p) => hostnameMatches(url.hostname, p.hostname))
}

/**
 * The message the admin forms show. Names the hosts rather than just refusing.
 *
 * One string literal, not three joined with `+`. The build folds a chain of
 * literals by overwriting the tail of each operand, which is how a snippet
 * reached the browser missing three of its four parts in [20]. That case was a
 * template literal; this one is not, and it is written this way anyway because
 * the rule is cheaper to keep than to re-derive.
 */
export const IMAGE_HOST_ERROR =
  'כתובת תמונה לא מורשית. מותר נתיב באתר עצמו (מתחיל ב-/) או https מאחד מהמארחים: Supabase Storage, ‏images.unsplash.com, ‏plus.unsplash.com, ‏picsum.photos, תת-דומיין של kenyonexpress.co.il, או r2.dev'
