import { CacheControl, withCacheControl } from '@/lib/cache/http'
// Partner API: Read-only products endpoint

import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  authenticatePartnerRequest,
  createRateLimitHeaders,
  logPartnerApiRequest,
} from '@/lib/partner-api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

const REQUIRED_SCOPE = 'products:read' as const

async function handleGET(req: NextRequest) {
  const startTime = Date.now()

  try {
    // Authenticate request
    const auth = await authenticatePartnerRequest(req, REQUIRED_SCOPE)
    if (auth instanceof NextResponse) {
      const response = auth as NextResponse
      await logPartnerApiRequest(
        'unknown',
        '/api/partners/v1/products',
        'GET',
        REQUIRED_SCOPE,
        response.status,
        Date.now() - startTime,
      )
      return auth
    }

    // Get query parameters
    const url = new URL(req.url)
    const page = Number.parseInt(url.searchParams.get('page') || '1')
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '20'), 100)
    const offset = (page - 1) * limit

    // Fetch products (read-only via public client)
    const admin = createAdminClient()
    const {
      data: products,
      error: queryError,
      count,
    } = await admin
      .from('products')
      .select(
        `
        id,
        slug,
        name_he,
        description_he,
        price_agora,
        platform_percent,
        approved,
        active,
        created_at,
        updated_at
      `,
        { count: 'exact' },
      )
      .eq('approved', true)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (queryError) {
      throw queryError
    }

    // Log successful request
    await logPartnerApiRequest(
      auth.apiKeyId,
      '/api/partners/v1/products',
      'GET',
      REQUIRED_SCOPE,
      200,
      Date.now() - startTime,
    )

    // Return response with rate limit headers
    return new NextResponse(
      JSON.stringify({
        status: 'success',
        data: products || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...createRateLimitHeaders(auth.rateLimitRemaining, 1000),
        },
      },
    )
  } catch (error) {
    log.error('products.partner_api_products_error', { error })

    return new NextResponse(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'An error occurred while fetching products',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

export const GET = withCacheControl(
  CacheControl.private,
  withRequestLog('/api/partners/v1/products', handleGET),
)
