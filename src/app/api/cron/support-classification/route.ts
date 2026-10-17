import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { processPendingSupportMessages } from '@/server/support/process'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Cron endpoint: Support message classification and routing
 *
 * Runs periodically (recommended: every 5-10 minutes) to:
 * 1. Classify new support messages
 * 2. Send auto-responses to simple messages
 * 3. Route complex issues to owner via WhatsApp + Email
 *
 * Protected by CRON_SECRET header validation
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  log.info('support.classification_start', {})

  try {
    const result = await processPendingSupportMessages()

    log.info('support.classification_complete', {
      processed: result.processed,
      autoResponded: result.autoResponded,
      ownerNotified: result.ownerNotified,
      errors: result.errors.length,
    })

    return NextResponse.json(
      {
        ok: true,
        processed: result.processed,
        autoResponded: result.autoResponded,
        ownerNotified: result.ownerNotified,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      { status: 200 },
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'unknown error'
    log.error('support.classification_error', { error: errorMsg })

    return NextResponse.json(
      {
        ok: false,
        error: errorMsg,
      },
      { status: 500 },
    )
  }
}

export const POST = withRequestLog('/api/cron/support-classification', handlePOST)
