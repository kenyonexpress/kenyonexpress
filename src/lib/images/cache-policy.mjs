/**
 * How long a proxied image may be cached, and the tags that let it be
 * purged before that.
 *
 * Two kinds of key live behind /images/r2, and they age differently:
 *
 *   wp/<aa>/<sha256>...   content-addressed by media-ingest. The bytes at
 *                         the key CANNOT change (the key is their hash), so
 *                         a year, immutable, forfeits nothing.
 *   products/<file>       named after the file an admin uploaded, and an
 *   live-assets/<path>    admin can upload a corrected photo under the same
 *                         name. Those are cached 30 days at the browser and
 *                         at the edge, and the purge webhook
 *                         (/api/webhooks/images/purge) invalidates the tag
 *                         the day a photo is replaced, so nobody waits the
 *                         30 days out.
 *
 * `stale-while-revalidate` on the mutable class means the edge keeps
 * answering while it refreshes, which is the difference between a purge and
 * a stampede on a catalogue page.
 *
 * Pure ESM with JSDoc types (tsconfig allowJs), so the route, its test and
 * scripts/r2-promote/run.mjs all read the same strings.
 */

export const CONTENT_ADDRESSED_PREFIX = 'wp/'

/** 30 days, the CDN ceiling for a mutable image key. */
export const CDN_IMAGE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Content-addressed keys: a year, immutable. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, s-maxage=31536000, immutable'

/**
 * A key the bucket does not hold: a minute, so a typo in a catalogue row is
 * not a year of 404s at the edge, and a promotion that lands a minute later
 * is served a minute later.
 */
export const MISSING_CACHE_CONTROL = 'public, max-age=60'

export const MUTABLE_CACHE_CONTROL = `public, max-age=${CDN_IMAGE_MAX_AGE_SECONDS}, s-maxage=${CDN_IMAGE_MAX_AGE_SECONDS}, stale-while-revalidate=86400`

/** @param {string} key */
export function isContentAddressedKey(key) {
  return key.startsWith(CONTENT_ADDRESSED_PREFIX)
}

/** @param {string} key */
export function cacheControlForKey(key) {
  return isContentAddressedKey(key) ? IMMUTABLE_CACHE_CONTROL : MUTABLE_CACHE_CONTROL
}

/** The tag that names every proxied image, and the tag of one prefix. */
export const IMAGES_CACHE_TAG = 'images'

/**
 * Tags are comma-delimited on the wire and case-sensitive, so a key is
 * percent-encoded (a comma becomes %2C) and the prefix tag is the first
 * segment only. 256 bytes is Vercel's ceiling per tag; a content-addressed
 * key is ~80 and a product file name is bounded by the upload path.
 */
/**
 * @param {string} key
 * @returns {string[]}
 */
export function cacheTagsForKey(key) {
  const prefix = key.split('/')[0] ?? ''
  const tags = [IMAGES_CACHE_TAG]
  if (prefix) tags.push(`${IMAGES_CACHE_TAG}:${prefix}`)
  const keyTag = `image:${encodeURIComponent(key)}`
  if (Buffer.byteLength(keyTag, 'utf8') <= 256) tags.push(keyTag)
  return tags
}

/** The `Vercel-Cache-Tag` header value for a key. */
/** @param {string} key */
export function cacheTagHeaderForKey(key) {
  return cacheTagsForKey(key).join(',')
}

/** The script's name for the same rule, kept for the ledger's readability. */
export const cacheControlForObjectKey = cacheControlForKey
