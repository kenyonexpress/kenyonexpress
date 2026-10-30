'use server'

import { randomBytes } from 'node:crypto'
import { newLinkCode } from '@/lib/affiliate/rules'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const PAGE = '/account/affiliate'

async function signedInUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * Applies to the affiliate program. The row starts `pending_review`; an admin
 * approves it on /admin/affiliates before any link can earn. Written with the
 * service role because `affiliates` lets only admins insert (RLS), and the
 * user id comes from the session, never from the form.
 */
async function runJoin(formData: FormData): Promise<void> {
  const user = await signedInUser()
  if (!user) redirect(`/login?next=${PAGE}`)
  if (!(await checkRateLimit(`affiliate-join:${user.id}`, 5, 3600))) redirect(`${PAGE}?error=rate`)

  const channel = String(formData.get('channel_description') ?? '')
    .trim()
    .slice(0, 500)
  const admin = createAdminClient()
  const { error } = await admin.from('affiliates').insert({
    user_id: user.id,
    affiliate_code: newLinkCode((n) => randomBytes(n)),
    status: 'pending_review',
    channel_description: channel || null,
  } as never)
  if (error && error.code !== '23505') {
    log.error('affiliate.join_failed', { reason: error.message })
    redirect(`${PAGE}?error=join`)
  }
  revalidatePath(PAGE)
  redirect(`${PAGE}?joined=1`)
}

const linkSchema = z.object({
  campaign_id: z.string().uuid(),
  target_path: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/([^/].*)?$/)
    .default('/'),
  product_slug: z
    .string()
    .trim()
    .max(200)
    .regex(/^[^/?#\s]*$/)
    .default(''),
})

/** Creates a tracking link for an approved affiliate on an active campaign. */
async function runCreateLink(formData: FormData): Promise<void> {
  const user = await signedInUser()
  if (!user) redirect(`/login?next=${PAGE}`)
  if (!(await checkRateLimit(`affiliate-link:${user.id}`, 30, 3600))) redirect(`${PAGE}?error=rate`)

  const parsed = linkSchema.safeParse({
    campaign_id: formData.get('campaign_id'),
    target_path: formData.get('target_path') || '/',
    product_slug: formData.get('product_slug') || '',
  })
  if (!parsed.success) redirect(`${PAGE}?error=link`)

  const admin = createAdminClient()
  const [{ data: affiliate }, { data: campaign }] = await Promise.all([
    admin.from('affiliates').select('id, status').eq('user_id', user.id).maybeSingle(),
    admin
      .from('affiliate_campaigns' as never)
      .select('id, active')
      .eq('id', parsed.data.campaign_id)
      .maybeSingle(),
  ])
  if (!affiliate || affiliate.status !== 'approved') redirect(`${PAGE}?error=not_approved`)
  if (!campaign || !(campaign as { active: boolean }).active) redirect(`${PAGE}?error=campaign`)

  // A product link points at that product's page and is unique per affiliate
  // per product (migration 319); it overrides any typed path.
  let productId: string | null = null
  let targetPath = parsed.data.target_path
  if (parsed.data.product_slug) {
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id, slug')
      .eq('slug', parsed.data.product_slug)
      .eq('status', 'active')
      .maybeSingle()
    if (productError || !product) redirect(`${PAGE}?error=product`)
    productId = product.id
    targetPath = `/product/${encodeURIComponent(product.slug)}`
  }

  const { error } = await admin.from('affiliate_links' as never).insert({
    affiliate_id: affiliate.id,
    campaign_id: parsed.data.campaign_id,
    code: newLinkCode((n) => randomBytes(n)),
    target_path: targetPath,
    ...(productId ? { product_id: productId } : {}),
  } as never)
  if (error?.code === '23505' && productId) redirect(`${PAGE}?error=duplicate`)
  if (error && error.code !== '23505') {
    log.error('affiliate.link_create_failed', { reason: error.message })
    redirect(`${PAGE}?error=link`)
  }
  revalidatePath(PAGE)
  redirect(`${PAGE}?linked=1`)
}

export async function joinAffiliateProgram(formData: FormData): Promise<void> {
  return withActionContext('affiliate.join', () => runJoin(formData))
}

export async function createAffiliateLink(formData: FormData): Promise<void> {
  return withActionContext('affiliate.create_link', () => runCreateLink(formData))
}
