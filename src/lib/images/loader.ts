/**
 * The image loader every `next/image` on the site goes through
 * (`images.loaderFile` in next.config.ts).
 *
 * It replaces Next's default loader module, so it has to BE the default
 * loader for every image it does not re-home: same `/_next/image?url&w&q`
 * shape, same closest-quality snap against `images.qualities`, same `dpl`
 * token on same-origin sources (Vercel skew protection keys on it). The test
 * next to this file holds the output byte-equal to Next's own loader for the
 * pass-through case, so the AVIF/WebP negotiation, the width ramp and the
 * 31-day optimizer cache are untouched by this file existing.
 *
 * The one thing it adds is `resolveImageSrc`: with NEXT_PUBLIC_R2_IMAGES=1 a
 * stored `/images/products/x` or `/images/cdn/<key>` is fetched by the
 * optimizer from the signed R2 proxy instead of from public/. The optimizer
 * then does what it always did: one request per rung of the srcset, each
 * answered in the format the browser's Accept header allows.
 */

import { getDeploymentId } from 'next/dist/shared/lib/deployment-id'
import { findClosestQuality } from 'next/dist/shared/lib/find-closest-quality'
import { resolveImageSrc } from './r2-paths'

/** What next/image hands a loader module: the props plus the resolved config. */
export type LoaderInput = {
  config?: { path?: string; qualities?: number[] }
  src: string
  width: number
  quality?: number
}

export default function r2ImageLoader({ config, src, width, quality }: LoaderInput): string {
  const resolved = resolveImageSrc(src)
  const q = findClosestQuality(quality, config as Parameters<typeof findClosestQuality>[1])
  const path = config?.path ?? '/_next/image'
  const dpl = resolved.startsWith('/') ? getDeploymentId() : undefined
  return `${path}?url=${encodeURIComponent(resolved)}&w=${width}&q=${q}${dpl ? `&dpl=${dpl}` : ''}`
}
