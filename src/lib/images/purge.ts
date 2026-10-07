// Purging a proxied image from every cache that holds it, by key.
//
// THREE LAYERS HOLD A PRODUCT PHOTO, and a purge that misses one is a purge
// that did not happen:
//
//   1. Vercel's CDN, which caches the /images/r2 response under the tags the
//      route sets (`Vercel-Cache-Tag`, src/lib/images/cache-policy.mjs).
//      Invalidated by tag: `POST /v1/edge-cache/invalidate-by-tags`.
//   2. Vercel's Image Optimization cache, which holds the AVIF/WebP
//      transforms of that response under a SYSTEM tag that is the source
//      image. Invalidated by source image:
//      `POST /v1/edge-cache/invalidate-by-src-images`. The source is sent in
//      every spelling the optimizer may have seen: the proxy path, and the
//      stored `/images/products/*` or `/images/cdn/*` path it maps from.
//   3. Cloudflare's edge, only when the bucket has a public domain
//      (R2_PUBLIC_BASE_URL) and the zone can be purged by URL
//      (`POST /zones/{zone}/purge_cache`, 30 URLs per call).
//
// Both Vercel calls INVALIDATE (serve stale, refresh in the background)
// rather than delete, which Vercel's own docs recommend and which keeps a
// purge of `images` (every product photo on the site) from turning into a
// stampede on the bucket.
//
// A backend that is not configured is reported, not skipped silently: the
// webhook answers 202 with `purged: false` and the reason, so an operator who
// fired it and still sees the old photo reads the answer rather than the
// cache headers.

import { IMAGES_CACHE_TAG, cacheTagsForKey } from './cache-policy.mjs'
import { LOCAL_CDN_PREFIX, LOCAL_PRODUCTS_PREFIX, R2_PROXY_PREFIX } from './r2-paths'

export type PurgeEnv = {
  VERCEL_API_TOKEN?: string
  VERCEL_PROJECT_ID?: string
  VERCEL_TEAM_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CLOUDFLARE_ZONE_ID?: string
  R2_PUBLIC_BASE_URL?: string
}

export type PurgeRequest = {
  /** Bucket keys, e.g. `products/b7.avif`. */
  keys: string[]
  /** Every proxied image. Tags only; the optimizer cache is left to expire. */
  all?: boolean
}

export type BackendResult = {
  backend: 'vercel-tags' | 'vercel-src-images' | 'cloudflare'
  ok: boolean
  /** 'unconfigured' when the credentials are absent; an HTTP status otherwise. */
  status: number | 'unconfigured'
  detail?: string
}

export type PurgeOutcome = {
  tags: string[]
  srcImages: string[]
  urls: string[]
  results: BackendResult[]
  /** True when at least one configured backend accepted the purge. */
  purged: boolean
}

/** Vercel's ceiling on tags per bulk call. */
export const VERCEL_TAGS_PER_CALL = 16
/** Cloudflare's ceiling on files per purge call. */
export const CLOUDFLARE_URLS_PER_CALL = 30

export const VERCEL_API_BASE = 'https://api.vercel.com'
export const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'

/** The stored path forms the optimizer may have fetched this key under. */
export function sourceImagesForKey(key: string): string[] {
  const sources = [`${R2_PROXY_PREFIX}${key}`]
  if (key.startsWith('products/'))
    sources.push(`${LOCAL_PRODUCTS_PREFIX}${key.slice('products/'.length)}`)
  else sources.push(`${LOCAL_CDN_PREFIX}${key}`)
  return sources
}

export function tagsForPurge(request: PurgeRequest): string[] {
  if (request.all) return [IMAGES_CACHE_TAG]
  const tags = new Set<string>()
  for (const key of request.keys) {
    for (const tag of cacheTagsForKey(key)) {
      // The prefix-wide and site-wide tags are implied by a key purge and
      // would purge far more than asked; only the key's own tag is sent.
      if (tag.startsWith('image:')) tags.add(tag)
    }
  }
  return [...tags]
}

export function publicUrlsForKeys(keys: string[], base: string | undefined): string[] {
  const root = (base ?? '').replace(/\/$/, '')
  if (!root || !/^https?:\/\//.test(root)) return []
  return keys.map((key) => `${root}/${key.split('/').map(encodeURIComponent).join('/')}`)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type Fetch = typeof fetch

async function postJson(
  fetchImpl: Fetch,
  url: string,
  token: string,
  body: unknown,
): Promise<{ status: number; detail?: string }> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return { status: res.status }
  const detail = await res.text().catch(() => '')
  return { status: res.status, detail: detail.slice(0, 300) }
}

function vercelUrl(path: string, env: PurgeEnv): string {
  const url = new URL(`${VERCEL_API_BASE}${path}`)
  url.searchParams.set('projectIdOrName', env.VERCEL_PROJECT_ID ?? '')
  if (env.VERCEL_TEAM_ID) url.searchParams.set('teamId', env.VERCEL_TEAM_ID)
  return url.toString()
}

async function purgeVercel(
  backend: 'vercel-tags' | 'vercel-src-images',
  items: string[],
  env: PurgeEnv,
  fetchImpl: Fetch,
): Promise<BackendResult> {
  const token = env.VERCEL_API_TOKEN
  if (!token || !env.VERCEL_PROJECT_ID) return { backend, ok: true, status: 'unconfigured' }
  if (items.length === 0) return { backend, ok: true, status: 204 }

  const path =
    backend === 'vercel-tags'
      ? '/v1/edge-cache/invalidate-by-tags'
      : '/v1/edge-cache/invalidate-by-src-images'
  const field = backend === 'vercel-tags' ? 'tags' : 'srcImages'

  let worst: { status: number; detail?: string } = { status: 200 }
  for (const batch of chunk(items, VERCEL_TAGS_PER_CALL)) {
    const body =
      backend === 'vercel-tags' ? { [field]: batch, target: 'production' } : { [field]: batch }
    const r = await postJson(fetchImpl, vercelUrl(path, env), token, body)
    if (r.status >= 400) worst = r
  }
  return { backend, ok: worst.status < 400, status: worst.status, detail: worst.detail }
}

async function purgeCloudflare(
  urls: string[],
  env: PurgeEnv,
  fetchImpl: Fetch,
): Promise<BackendResult> {
  const backend = 'cloudflare' as const
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    return { backend, ok: true, status: 'unconfigured' }
  }
  if (urls.length === 0) return { backend, ok: true, status: 204 }
  let worst: { status: number; detail?: string } = { status: 200 }
  for (const batch of chunk(urls, CLOUDFLARE_URLS_PER_CALL)) {
    const r = await postJson(
      fetchImpl,
      `${CLOUDFLARE_API_BASE}/zones/${encodeURIComponent(env.CLOUDFLARE_ZONE_ID)}/purge_cache`,
      env.CLOUDFLARE_API_TOKEN,
      { files: batch },
    )
    if (r.status >= 400) worst = r
  }
  return { backend, ok: worst.status < 400, status: worst.status, detail: worst.detail }
}

/**
 * Fire the purge at every configured backend. Never throws on a backend
 * failure: each backend reports its own status, and the caller decides what
 * a partial purge means (the webhook answers 502 so the sender retries).
 */
export async function purgeImageCache(
  request: PurgeRequest,
  { env = process.env as PurgeEnv, fetchImpl = fetch }: { env?: PurgeEnv; fetchImpl?: Fetch } = {},
): Promise<PurgeOutcome> {
  const keys = [...new Set(request.keys)]
  const tags = tagsForPurge({ keys, all: request.all })
  const srcImages = request.all ? [] : keys.flatMap(sourceImagesForKey)
  const urls = request.all ? [] : publicUrlsForKeys(keys, env.R2_PUBLIC_BASE_URL)

  const results = await Promise.all([
    purgeVercel('vercel-tags', tags, env, fetchImpl),
    purgeVercel('vercel-src-images', srcImages, env, fetchImpl),
    purgeCloudflare(urls, env, fetchImpl),
  ])

  const purged = results.some(
    (r) => r.ok && typeof r.status === 'number' && r.status < 400 && r.status !== 204,
  )
  return { tags, srcImages, urls, results, purged }
}
