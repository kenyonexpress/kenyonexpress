import { CacheControl, withCacheControl } from '@/lib/cache/http'
// Partner API: Read-only categories endpoint

import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  authenticatePartnerRequest,
  createRateLimitHeaders,
  logPartnerApiRequest,
} from '@/lib/partner-api/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

const REQUIRED_SCOPE = 'categories:read' as const

async function handleGET(req: NextRequest) {
  const startTime = Date.now()

  try {
    // Authenticate request
    const auth = await authenticatePartnerRequest(req, REQUIRED_SCOPE)
    if (auth instanceof NextResponse) {
      const response = auth as NextResponse
      await logPartnerApiRequest(
        'unknown',
        '/api/partners/v1/categories',
        'GET',
        REQUIRED_SCOPE,
        response.status,
        Date.now() - startTime,
      )
      return auth
    }

    // Fetch categories (active only, read-only)
    const admin = createAdminClient()
    const { data: categories, error: queryError } = await admin
      .from('categories')
      .select(
        `
        id,
        slug,
        name_he,
        description_he,
        active,
        created_at,
        updated_at
      `,
      )
      .eq('active', true)
      .order('name_he', { ascending: true })

    if (queryError) {
      throw queryError
    }

    // Log successful request
    await logPartnerApiRequest(
      auth.apiKeyId,
      '/api/partners/v1/categories',
      'GET',
      REQUIRED_SCOPE,
      200,
      Date.now() - startTime,
    )

    // Return response with rate limit headers
    return new NextResponse(
      JSON.stringify({
        status: 'success',
        data: categories || [],
        total: categories?.length || 0,
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
    log.error('categories.partner_api_categories_error', { error })

    return new NextResponse(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'An error occurred while fetching categories',
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
  withRequestLog('/api/partners/v1/categories', handleGET),
)
