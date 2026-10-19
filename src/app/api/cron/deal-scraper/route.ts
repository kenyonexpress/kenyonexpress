/**
 * Cron endpoint for continuous deal scraping.
 *
 * Runs on a schedule to:
 * 1. Fetch deals from approved sources
 * 2. Deduplicate against existing deals
 * 3. Validate images
 * 4. Stage for approval
 *
 * Triggered by Vercel Cron every 30 minutes
 */

import {
  type ScrapingResult,
  ingestScrapedDeals,
  scrapeLiveSite,
  validatePendingDeals,
} from '@/lib/deals/scraper'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Verify cron request is authorized.
 */
function isAuthorized(request: NextRequest): boolean {
  if (!CRON_SECRET) {
    console.warn('CRON_SECRET not set - allowing request (development mode)')
    return true
  }

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${CRON_SECRET}`
}

/**
 * POST /api/cron/deal-scraper
 *
 * Scrapes deals from approved sources and stages for review.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify authorization
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing CRON_SECRET' },
      { status: 401 },
    )
  }

  const results: ScrapingResult[] = []
  const errors: string[] = []

  try {
    // Get active sources from database
    const client = await createClient()
    const { data: sources, error: sourcesError } = await client
      .from('deal_sources')
      .select('id, name, url, scraper_type, scraper_config')
      .eq('is_active', true)

    if (sourcesError) {
      throw new Error(`Failed to fetch deal sources: ${sourcesError.message}`)
    }

    if (!sources || sources.length === 0) {
      return NextResponse.json(
        {
          message: 'No active deal sources configured',
          results: [],
        },
        { status: 200 },
      )
    }

    // Process each source
    for (const source of sources) {
      const startedAt = new Date()

      try {
        let deals = []

        // Scrape based on source type
        if (source.scraper_type === 'http') {
          deals = await scrapeLiveSite()
        } else {
          errors.push(
            `Scraper type '${source.scraper_type}' not yet implemented for source ${source.name}`,
          )
          continue
        }

        // Ingest deals
        const ingestResult = await ingestScrapedDeals(source.id, deals)

        // Validate images for newly inserted deals
        const _validationResult = await validatePendingDeals(source.id)

        // Update source's last_scraped_at timestamp
        await client
          .from('deal_sources')
          .update({ last_scraped_at: new Date().toISOString() })
          .eq('id', source.id)

        results.push({
          sourceId: source.id,
          dealsFound: deals.length,
          dealsInserted: ingestResult.inserted,
          dealsSkipped: ingestResult.duplicates,
          dealsRejected: ingestResult.errors.length,
          duplicatesFound: ingestResult.duplicates,
          errors: ingestResult.errors,
          startedAt,
          completedAt: new Date(),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`Error scraping source ${source.name}: ${message}`)
      }
    }

    // Send status notification
    if (errors.length > 0) {
      await sendNtfyAlert(
        `Deal Scraper: ${errors.length} errors`,
        errors.slice(0, 3).join('\n'),
        'warning',
      )
    }

    // Calculate totals
    const totalDeals = results.reduce((sum, r) => sum + r.dealsFound, 0)
    const totalInserted = results.reduce((sum, r) => sum + r.dealsInserted, 0)
    const totalDuplicates = results.reduce((sum, r) => sum + r.duplicatesFound, 0)

    return NextResponse.json(
      {
        message: `Deal scraping complete: ${totalDeals} deals found, ${totalInserted} inserted, ${totalDuplicates} duplicates`,
        results,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Deal scraper cron error:', message)

    await sendNtfyAlert('Deal Scraper Error', message, 'critical')

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Send alert via ntfy.sh.
 */
async function sendNtfyAlert(
  title: string,
  message: string,
  priority: 'info' | 'warning' | 'critical' = 'warning',
): Promise<void> {
  const ntfyTopic = process.env.NTFY_TOPIC || 'kenyon-ofir-limit'

  try {
    await fetch(`https://ntfy.sh/${ntfyTopic}`, {
      method: 'POST',
      headers: {
        Title: title,
        Priority: priority === 'critical' ? 'high' : 'default',
      },
      body: message,
    })
  } catch (error) {
    console.error('Failed to send ntfy alert:', error)
  }
}
