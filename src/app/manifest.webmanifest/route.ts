import { CacheControl } from '@/lib/cache/http'
import { siteManifest } from '@/lib/pwa/site-manifest'
import { NextResponse } from 'next/server'

/**
 * The shop's manifest, at the URL the file convention used to serve it from.
 * See lib/pwa/site-manifest.ts for why it moved. The link tag that points
 * here is the root layout's `manifest` metadata field.
 */
export function GET() {
  return NextResponse.json(siteManifest(), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // The feed policy: fetched by a browser or a launcher, never browsed,
      // and an hour of edge cache with a day of stale is exactly the shape.
      'cache-control': CacheControl.feed,
    },
  })
}
