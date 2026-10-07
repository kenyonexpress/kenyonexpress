// Signed reads of image objects from R2, for the proxy route at /images/r2.
//
// WHY A PROXY AND NOT A PRESIGNED URL IN THE PAGE. The bucket has no public
// domain (R2_PUBLIC_BASE_URL is unset in every environment this repo can see),
// so every GET needs a SigV4 signature, and the only place the secret may live
// is the server. A presigned GET URL in the HTML would work, but it is a new
// URL every time it is minted, which makes it a new cache key for the image
// optimizer (`minimumCacheTTL` is 31 days and would never hit) and a signed
// credential in every product card. A same-origin path is stable, cacheable at
// the edge, carries nothing, and the optimizer treats it like any file under
// public/, so `formats: ['image/avif', 'image/webp']` and the width ramp apply
// unchanged. The day the bucket gets a public domain, the rewrite SQL from
// scripts/r2-promote points the catalogue there and this route goes quiet.
//
// WHICH BUCKET. The ingest pipeline and the promotion script write to
// `R2_BUCKET` (the Vercel project spells it `R2_BUCKET_NAME`); the newer
// multi-bucket service has a code constant for product images. The env wins
// when set, so an operator can point reads at the bucket the uploads went to
// without a deploy, and the constant is the fallback so a half-provisioned
// environment does not read from an empty string.

import 'server-only'

import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { assertValidR2Key, r2BucketName } from './r2-buckets'
import { getR2Client, isR2StorageConfigured } from './r2-service'

export function imageBucketName(): string {
  return process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || r2BucketName('product-images')
}

export function isR2ReadConfigured(): boolean {
  return isR2StorageConfigured() && Boolean(imageBucketName())
}

/**
 * The prefixes the proxy will fetch. The bucket is the catalogue's and the
 * keys are content-addressed, but a proxy that forwards any key is an open
 * reader of whatever lands in the bucket next, so the set of prefixes is the
 * set the promotion script writes and nothing else.
 */
export const R2_IMAGE_KEY_PREFIXES = ['wp/', 'products/', 'live-assets/'] as const

/**
 * Raster formats only. SVG is excluded on purpose: a same-origin SVG is a
 * script-capable document, and `products/` is written by an upload path.
 */
export const R2_IMAGE_EXTENSIONS: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
}

/** True for a key the proxy is willing to fetch; false, never a throw, otherwise. */
export function isServableImageKey(key: string): boolean {
  try {
    assertValidR2Key(key)
  } catch {
    return false
  }
  if (!R2_IMAGE_KEY_PREFIXES.some((p) => key.startsWith(p))) return false
  return extensionOf(key) in R2_IMAGE_EXTENSIONS
}

export function extensionOf(key: string): string {
  const dot = key.lastIndexOf('.')
  return dot === -1 ? '' : key.slice(dot + 1).toLowerCase()
}

export type R2ImageObject =
  | {
      status: 200
      body: ReadableStream<Uint8Array> | null
      contentType: string
      contentLength: number | null
      etag: string | null
    }
  | { status: 304; etag: string | null }
  | { status: 404 }

type S3Failure = { name?: string; $metadata?: { httpStatusCode?: number } }

function statusOf(err: unknown): number | undefined {
  const e = err as S3Failure
  if (e?.$metadata?.httpStatusCode) return e.$metadata.httpStatusCode
  if (e?.name === 'NoSuchKey' || e?.name === 'NotFound') return 404
  return undefined
}

/**
 * One object, as a 200 with a web stream, a 304 when `ifNoneMatch` still
 * matches, or a 404. Anything else (a 403 from revoked credentials, a 5xx)
 * is thrown, so the route answers 502 and the log says why, rather than a
 * 404 that reads as "the image was never there".
 */
export async function getR2ImageObject(
  key: string,
  { ifNoneMatch, method = 'GET' }: { ifNoneMatch?: string | null; method?: 'GET' | 'HEAD' } = {},
): Promise<R2ImageObject> {
  const Bucket = imageBucketName()
  const client = getR2Client()
  const conditional = ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}
  try {
    if (method === 'HEAD') {
      const head = await client.send(new HeadObjectCommand({ Bucket, Key: key, ...conditional }))
      return {
        status: 200,
        body: null,
        contentType:
          head.ContentType ?? R2_IMAGE_EXTENSIONS[extensionOf(key)] ?? 'application/octet-stream',
        contentLength: head.ContentLength ?? null,
        etag: head.ETag ?? null,
      }
    }
    const res = await client.send(new GetObjectCommand({ Bucket, Key: key, ...conditional }))
    return {
      status: 200,
      body: res.Body ? (res.Body.transformToWebStream() as ReadableStream<Uint8Array>) : null,
      contentType:
        res.ContentType ?? R2_IMAGE_EXTENSIONS[extensionOf(key)] ?? 'application/octet-stream',
      contentLength: res.ContentLength ?? null,
      etag: res.ETag ?? null,
    }
  } catch (err) {
    const status = statusOf(err)
    if (status === 304) return { status: 304, etag: ifNoneMatch ?? null }
    if (status === 404) return { status: 404 }
    throw err
  }
}
