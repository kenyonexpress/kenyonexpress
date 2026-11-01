import { CacheControl, withCacheControl } from '@/lib/cache/http'
import { withRequestLog } from '@/lib/observability/with-request-log'
import type { CustomerSegmentType, UserSegmentInfo } from '@/lib/rfm-analysis'
import { CAMPAIGN_DESCRIPTIONS, SEGMENT_LABELS } from '@/lib/rfm-analysis'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

interface CampaignHook {
  segment_type: CustomerSegmentType
  name_he: string
  name_en: string
  description_he: string
  description_en: string
  enabled: boolean
  audience_size?: number
}

interface CampaignHookPayload {
  segment_type: CustomerSegmentType
  campaign_name?: string
  message?: string
}

interface CampaignResponse {
  status: 'success' | 'error'
  campaign?: CampaignHook
  campaigns?: CampaignHook[]
  message?: string
  audience_size?: number
  triggered_at?: string
}

async function handleGET(_req: NextRequest): Promise<Response> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          },
        },
      },
    )

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    // Get user's current segments
    const { data: userSegments, error: segmentError } = await supabase.rpc('fn_get_user_segments')

    if (segmentError) {
      throw new Error(`Failed to get user segments: ${segmentError.message}`)
    }

    // Build campaign hooks for user's segments
    const campaigns: CampaignHook[] = (userSegments || []).map((segment: unknown) => {
      const info = segment as UserSegmentInfo
      return {
        segment_type: info.segment_type,
        name_he: info.name_he,
        name_en: info.name_en,
        description_he: CAMPAIGN_DESCRIPTIONS[info.segment_type]?.he,
        description_en: CAMPAIGN_DESCRIPTIONS[info.segment_type]?.en,
        enabled: info.campaign_hook_enabled,
      }
    })

    const response: CampaignResponse = {
      status: 'success',
      campaigns,
    }

    return Response.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get campaigns'

    return Response.json(
      {
        status: 'error',
        message,
      },
      { status: 500 },
    )
  }
}

export const GET = withCacheControl(
  CacheControl.private,
  withRequestLog('campaigns-hooks', handleGET),
)

async function handlePOST(req: NextRequest): Promise<Response> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          },
        },
      },
    )

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit by user ID
    if (!(await checkRateLimit(`campaign-trigger:${user.id}`, 5, 3600))) {
      return Response.json(
        { status: 'error', message: 'Too many campaign triggers. Please try again later.' },
        { status: 429 },
      )
    }

    // Parse request body
    let payload: CampaignHookPayload
    try {
      payload = await req.json()
    } catch {
      return Response.json({ status: 'error', message: 'Invalid JSON payload' }, { status: 400 })
    }

    const { segment_type } = payload

    if (!segment_type) {
      return Response.json(
        { status: 'error', message: 'segment_type is required' },
        { status: 400 },
      )
    }

    // Validate segment type
    const validSegments = ['champions', 'loyal', 'potential', 'at_risk', 'dormant']
    if (!validSegments.includes(segment_type)) {
      return Response.json(
        {
          status: 'error',
          message: `Invalid segment_type. Must be one of: ${validSegments.join(', ')}`,
        },
        { status: 400 },
      )
    }

    // Verify user is in the segment
    const { data: userSegments, error: segmentError } = await supabase.rpc('fn_get_user_segments')

    if (segmentError) {
      throw new Error(`Failed to verify segment: ${segmentError.message}`)
    }

    const segments = (userSegments || []) as UserSegmentInfo[]
    const isInSegment = segments.some((s: UserSegmentInfo) => s.segment_type === segment_type)

    if (!isInSegment) {
      return Response.json(
        {
          status: 'error',
          message: `User is not in ${segment_type} segment`,
        },
        { status: 403 },
      )
    }

    // In a real implementation, this would:
    // 1. Create a campaign record
    // 2. Queue email notifications via the outbox pattern
    // 3. Track engagement metrics
    // 4. Log to analytics/Sentry

    const response: CampaignResponse = {
      status: 'success',
      message: `Campaign triggered for ${segment_type} segment`,
      campaign: {
        segment_type,
        name_he: SEGMENT_LABELS[segment_type]?.he || segment_type,
        name_en: SEGMENT_LABELS[segment_type]?.en || segment_type,
        description_he: CAMPAIGN_DESCRIPTIONS[segment_type]?.he || 'Campaign',
        description_en: CAMPAIGN_DESCRIPTIONS[segment_type]?.en || 'Campaign',
        enabled: true,
      },
      triggered_at: new Date().toISOString(),
    }

    return Response.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to trigger campaign'

    return Response.json(
      {
        status: 'error',
        message,
      },
      { status: 500 },
    )
  }
}

export const POST = withRequestLog('campaigns-hooks', handlePOST)
