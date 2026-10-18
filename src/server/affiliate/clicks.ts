import 'server-only'

import { createHash } from 'node:crypto'
import { isLinkCode } from '@/lib/affiliate/rules'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * One counted click per visitor per link per day (unique index in 283). The
 * IP is stored only as a salted SHA-256, which is enough to de-duplicate and
 * not enough to identify anyone.
 */
export async function recordAffiliateClick(input: {
  code: string
  ip: string | null
  landingPath: string
  referer: string | null
}): Promise<void> {
  if (!isLinkCode(input.code)) return
  const admin = createAdminClient()
  const { data: link, error } = await admin
    .from('affiliate_links' as never)
    .select('id')
    .eq('code', input.code)
    .maybeSingle()
  if (error || !link) return

  const salt = process.env.AFFILIATE_IP_SALT ?? 'kenyonexpress-affiliate'
  const ipHash = createHash('sha256')
    .update(`${input.ip ?? 'unknown'}|${salt}`)
    .digest('hex')

  const { error: insertError } = await admin.from('affiliate_clicks' as never).upsert(
    {
      link_id: (link as { id: string }).id,
      ip_hash: ipHash,
      landing_path: input.landingPath.slice(0, 300),
      referer: input.referer?.slice(0, 300) ?? null,
    } as never,
    { onConflict: 'link_id,ip_hash,click_day', ignoreDuplicates: true },
  )
  if (insertError) log.warn('affiliate.click_insert_failed', { reason: insertError.message })
}
