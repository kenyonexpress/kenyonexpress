import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { getR2ImageObject, isR2ReadConfigured, isServableImageKey } from '@/lib/storage/r2-read'
import type { NextRequest } from 'next/server'

/**
 * `/images/r2/<key>`: the catalogue's images, read from the private bucket
 * with a server-side signature and answered as if they were files under
 * public/.
 *
 * Every key is content-addressed or a promoted product file, so the bytes at
 * a path never change: a year, immutable, at the browser and at the edge
 * (`s-maxage` is what Vercel's cache reads for a function response). The
 * image optimizer is the main caller, once per srcset rung per format, and
 * after that the edge answers. `If-None-Match` is forwarded so a revalidation
 * costs a HEAD-sized round trip and no body.
 *
 * Failure shapes are kept apart on purpose: an unknown or unservable key is a
 * 404 that may be cached briefly; a bucket that cannot be reached (revoked
 * token, 5xx) is a 502 with `no-store`, so a credential rotation shows up as
 * errors in the log and not as a catalogue of cached broken images.
 *
 * Not behind the proxy's rate limiter: the matcher in src/proxy.ts excludes
 * image extensions, and the edge cache is the throttle that matters here.
 */

const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable'

type Context = { params: Promise<{ key: string[] }> }

async function serve(request: NextRequest, context: Context, method: 'GET' | 'HEAD') {
  const { key: segments } = await context.params
  const key = (segments ?? []).join('/')
  if (!isServableImageKey(key)) return new Response(null, { status: 404 })

  if (!isR2ReadConfigured()) {
    log.warn('images.r2.unconfigured', { key })
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } })
  }

  let object: Awaited<ReturnType<typeof getR2ImageObject>>
  try {
    object = await getR2ImageObject(key, {
      ifNoneMatch: request.headers.get('if-none-match'),
      method,
    })
  } catch (error) {
    log.error('images.r2.fetch_failed', {
      key,
      err: error instanceof Error ? error : new Error(String(error)),
    })
    return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } })
  }

  if (object.status === 404) {
    return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=60' } })
  }

  if (object.status === 304) {
    const headers = new Headers({ 'cache-control': IMMUTABLE })
    if (object.etag) headers.set('etag', object.etag)
    return new Response(null, { status: 304, headers })
  }

  const headers = new Headers({
    'content-type': object.contentType,
    'cache-control': IMMUTABLE,
    'x-content-type-options': 'nosniff',
    'content-disposition': 'inline',
  })
  if (object.etag) headers.set('etag', object.etag)
  if (object.contentLength != null) headers.set('content-length', String(object.contentLength))

  return new Response(method === 'HEAD' ? null : object.body, { status: 200, headers })
}

export const GET = withRequestLog('/images/r2', (request: NextRequest, context: Context) =>
  serve(request, context, 'GET'),
)

export const HEAD = withRequestLog('/images/r2', (request: NextRequest, context: Context) =>
  serve(request, context, 'HEAD'),
)
