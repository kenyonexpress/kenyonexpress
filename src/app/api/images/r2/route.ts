/**
 * Cloudflare R2 Image Resizing proxy route.
 *
 * When R2 is enabled, this route proxies image requests through:
 * /api/images/r2/cdn-cgi/image/[options]/[path] -> CDN
 *
 * Falls back to Vercel Image Optimization if R2 is not available.
 *
 * GET /api/images/r2/cdn-cgi/image/width=400,format=avif/products/sku123.jpg
 */

import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { R2_CONFIG, isR2Enabled } from '@/lib/images/optimizer'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { limitByIp } from '@/lib/rate-limit/route-guard'
import { type NextRequest, NextResponse } from 'next/server'

async function handleGET(request: NextRequest) {
  const limited = await limitByIp('r2-image', 600, 60)
  if (limited) return limited

  const { pathname } = request.nextUrl

  // Extract the image path from the route:
  // /api/images/r2/cdn-cgi/image/[options]/[image-path]
  const match = pathname.match(/\/api\/images\/r2\/cdn-cgi\/image\/([^/]+)\/(.+)/)

  if (!match) {
    return NextResponse.json({ error: 'Invalid image request format' }, { status: 400 })
  }

  const [, options, imagePath] = match
  if (!imagePath || imagePath.split('/').includes('..') || options === '..') {
    return NextResponse.json({ error: 'Invalid image request format' }, { status: 400 })
  }
  const sourceUrl = `/${imagePath}`

  // If R2 is not enabled, return a 503 Service Unavailable
  if (!isR2Enabled()) {
    return NextResponse.json(
      {
        error: 'R2 image optimization not configured',
        message: 'Falling back to Vercel Image Optimization',
      },
      { status: 503 },
    )
  }

  try {
    // Build the Cloudflare Image Resizing URL
    const cfUrl = `${R2_CONFIG.publicDomain}/cdn-cgi/image/${options}${sourceUrl}`

    // Fetch from Cloudflare with appropriate headers
    const response = await fetchWithTimeout(cfUrl, {
      method: 'GET',
      headers: {
        'User-Agent': request.headers.get('user-agent') || 'KenyonExpress/1.0',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image from R2', status: response.status },
        { status: response.status },
      )
    }

    // Stream the image response with appropriate caching headers
    const contentType = response.headers.get('content-type') || 'image/webp'
    const cacheControl = 'public, max-age=31536000, immutable'

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Image-Source': 'cloudflare-r2',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Image optimization failed', details: message },
      { status: 500 },
    )
  }
}

/**
 * Serve static/public images through R2 when available.
 *
 * GET /api/images/r2/public/products/sku123.jpg
 */
async function handleHEAD(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isR2Enabled()) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 })
  }

  try {
    const cfUrl = `${R2_CONFIG.publicDomain}${pathname.replace('/api/images/r2', '')}`
    const response = await fetchWithTimeout(cfUrl, { method: 'HEAD' })

    return new NextResponse(null, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to check image' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/images/r2', handleGET)
export const HEAD = withRequestLog('/api/images/r2', handleHEAD)
