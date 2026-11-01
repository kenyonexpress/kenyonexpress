import { CacheControl } from '@/lib/cache/http'
import { getDealsPage } from '@/lib/home-data'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { NextResponse } from 'next/server'

async function handleGET(request: Request) {
  const offset = Number(new URL(request.url).searchParams.get('offset') ?? '0')
  const page = await getDealsPage(Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0)
  return NextResponse.json(page, {
    headers: { 'Cache-Control': CacheControl.search },
  })
}

export const GET = withRequestLog('/api/home/deals', handleGET)
