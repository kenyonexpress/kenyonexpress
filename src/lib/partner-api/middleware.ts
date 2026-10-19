// Partner API middleware for authentication and rate limiting

import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'
import { type PartnerApiScope, extractApiKey, hasScopePermission, hashApiKey } from './index'

export interface AuthenticatedRequest {
  apiKeyId: string
  partnerId: string
  scopes: PartnerApiScope[]
  rateLimitRemaining: number
}

/**
 * Authenticate API request using API key
 * Returns request context or error response
 */
export async function authenticatePartnerRequest(
  req: NextRequest,
  requiredScope: PartnerApiScope,
): Promise<AuthenticatedRequest | NextResponse> {
  const authHeader = req.headers.get('Authorization') ?? undefined
  const apiKey = extractApiKey(authHeader)

  if (!apiKey) {
    return new NextResponse(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'API key required. Use: Authorization: Bearer <api-key>',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Hash the key to look it up
  const keyHash = hashApiKey(apiKey)
  const admin = createAdminClient()

  // Get API key record
  const { data: keyRecord, error: keyError } = await admin
    .from('partner_api_keys')
    .select('id, partner_id, scopes, rate_limit_per_hour, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single()

  if (keyError || !keyRecord || !keyRecord.is_active) {
    return new NextResponse(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Check expiration
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return new NextResponse(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'API key has expired',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Check scope permission
  const scopes: PartnerApiScope[] = keyRecord.scopes || []
  if (!hasScopePermission(scopes, requiredScope)) {
    return new NextResponse(
      JSON.stringify({
        error: 'Forbidden',
        message: `This API key does not have permission for '${requiredScope}'`,
        requiredScope,
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  // Check rate limit
  const { data: rateLimitResult, error: rateLimitError } = await admin.rpc(
    'fn_check_api_rate_limit',
    {
      p_api_key_id: keyRecord.id,
    },
  )

  if (rateLimitError || !rateLimitResult?.allowed) {
    const remaining = rateLimitResult?.remaining ?? 0
    const limit = rateLimitResult?.limit ?? keyRecord.rate_limit_per_hour

    return new NextResponse(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        limit,
        current: limit - remaining,
        resetIn: 'approximately 1 hour',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
        },
      },
    )
  }

  return {
    apiKeyId: keyRecord.id,
    partnerId: keyRecord.partner_id,
    scopes,
    rateLimitRemaining: rateLimitResult.remaining || 0,
  }
}

/**
 * Log API request to audit trail
 */
export async function logPartnerApiRequest(
  apiKeyId: string,
  endpoint: string,
  method: string,
  scope: PartnerApiScope,
  responseStatus: number,
  responseTimeMs: number,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.rpc('fn_log_api_request', {
      p_api_key_id: apiKeyId,
      p_endpoint: endpoint,
      p_method: method,
      p_scope: scope,
      p_response_status: responseStatus,
      p_response_time_ms: responseTimeMs,
    })
  } catch (error) {
    // Log error but don't fail the request
    console.error('Failed to log API request:', error)
  }
}

/**
 * Create rate limit response headers
 */
export function createRateLimitHeaders(remaining: number, limit: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}
