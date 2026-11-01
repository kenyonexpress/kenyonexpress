import { buildCachePaths, buildCacheTags, sendCachePurgeRequest } from '@/lib/cache'
import { CacheControl, withCacheControl } from '@/lib/cache/http'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { requestIp } from '@/lib/rate-limit/request-ip'
import { bearerMatches } from '@/lib/security/constant-time'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request)
  if (!(await checkRateLimit(`cache-purge:${ip}`, 30, 60))) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': '60' } },
    )
  }
  const auth = request.headers.get('authorization')
  if (!bearerMatches(auth, process.env.CRON_SECRET || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { resource, id, tags, paths } = body

  if (!resource && !tags) {
    return NextResponse.json({ error: 'Missing resource or tags' }, { status: 400 })
  }

  const cacheTags = tags || (resource ? [buildCacheTags(resource, id)] : [])
  const cachePaths = paths || (resource && id ? buildCachePaths(cacheTags[0]) : [])

  await sendCachePurgeRequest(cacheTags, cachePaths)

  return NextResponse.json(
    {
      success: true,
      purged: {
        tags: cacheTags,
        paths: cachePaths,
        timestamp: new Date().toISOString(),
      },
    },
    { status: 200 },
  )
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const cron = request.headers.get('x-vercel-cron')
  if (!cron) {
    return NextResponse.json({ error: 'Health check - no cron header' }, { status: 200 })
  }

  const regions =
    process.env.VERCEL_CDN_REGIONS && process.env.VERCEL_CDN_REGIONS !== 'undefined'
      ? process.env.VERCEL_CDN_REGIONS.split(',')
      : ['fra1']

  return NextResponse.json(
    {
      status: 'ready',
      service: 'cache-purge-endpoint',
      regions,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}

export const POST = withRequestLog('/api/cache/purge', handlePOST)
export const GET = withCacheControl(
  CacheControl.private,
  withRequestLog('/api/cache/purge', handleGET),
)
