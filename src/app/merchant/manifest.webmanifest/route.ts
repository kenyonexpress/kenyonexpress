import { CacheControl } from '@/lib/cache/http'
import { merchantScanManifest } from '@/lib/pwa/merchant-scan-manifest'
import { NextResponse } from 'next/server'

/**
 * The till's manifest. Public, like every manifest: a browser fetches it
 * without credentials, and the proxy's session gate on /merchant/** is what
 * protects the page it starts at, not this file.
 */
export function GET() {
  return NextResponse.json(merchantScanManifest(), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // The feed policy: fetched by a browser or a launcher, never browsed,
      // and an hour of edge cache with a day of stale is exactly the shape.
      'cache-control': CacheControl.feed,
    },
  })
}
