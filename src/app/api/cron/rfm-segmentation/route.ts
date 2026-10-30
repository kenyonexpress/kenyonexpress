/**
 * POST /api/cron/rfm-segmentation
 *
 * Calculates RFM scores and segments all users.
 * Triggered periodically (e.g., daily) via cron.
 *
 * Rate: once per day (24 hours)
 * Cost: ~O(n) where n = number of users with orders
 * Workflow:
 *   1. Call fn_calculate_rfm_scores() to update RFM metrics
 *   2. Call fn_segment_users() to assign users to segments
 *   3. Return summary of processed users
 */

import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

export const maxDuration = 300

interface RFMResponse {
  status: 'success' | 'error'
  message: string
  rfm_calculated?: number
  users_segmented?: number
  timestamp: string
  duration_ms?: number
}

async function handlePOST(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(req.headers.get('authorization'), secret ?? '')) {
    return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    // Create Supabase client with service role for admin operations
    const supabase = createAdminClient()

    // Step 1: Calculate RFM scores for all users
    const { data: rfmResults, error: rfmError } = await supabase.rpc('fn_calculate_rfm_scores')

    if (rfmError) {
      throw new Error(`RFM calculation failed: ${rfmError.code} - ${rfmError.message}`)
    }

    const rfmCalculated = Array.isArray(rfmResults) ? rfmResults.length : 0

    // Step 2: Segment users based on RFM thresholds
    const { data: segmentResults, error: segmentError } = await supabase.rpc('fn_segment_users')

    if (segmentError) {
      throw new Error(`User segmentation failed: ${segmentError.code} - ${segmentError.message}`)
    }

    const usersSegmented = Array.isArray(segmentResults) ? segmentResults.length : 0

    const duration = Date.now() - startTime

    const response: RFMResponse = {
      status: 'success',
      message: 'RFM analysis and user segmentation completed',
      rfm_calculated: rfmCalculated,
      users_segmented: usersSegmented,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
    }

    return Response.json(response)
  } catch (error) {
    const duration = Date.now() - startTime

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    const response: RFMResponse = {
      status: 'error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
    }

    return Response.json(response, { status: 500 })
  }
}

export const GET = withRequestLog('rfm-segmentation', handlePOST)
