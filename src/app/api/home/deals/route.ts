import { getDealsPage } from '@/lib/home-data'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const offset = Number(new URL(request.url).searchParams.get('offset') ?? '0')
  const page = await getDealsPage(Number.isFinite(offset) ? offset : 0)
  return NextResponse.json(page, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
