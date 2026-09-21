import { buildAssetLinks, parseFingerprints } from '@/lib/pwa/deep-links'
import { NextResponse } from 'next/server'

/**
 * Android App Links verification. 404 until the signing certificate's
 * SHA-256 fingerprint is configured; see `src/lib/pwa/deep-links.ts`.
 */
export function GET(): NextResponse {
  const fingerprints = parseFingerprints(process.env.ANDROID_APP_SHA256_FINGERPRINTS)
  if (!fingerprints) return new NextResponse(null, { status: 404 })
  return NextResponse.json(buildAssetLinks(fingerprints), {
    headers: {
      'content-type': 'application/json',
      // The verifier caches for a day on its own; an hour here keeps a
      // fingerprint rotation from being served stale by our own CDN.
      'cache-control': 'public, max-age=3600',
    },
  })
}
