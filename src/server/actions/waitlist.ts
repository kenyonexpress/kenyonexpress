'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { z } from 'zod'

/**
 * "Tell me when it is back."
 *
 * WHAT THE SOLD-OUT PAGE DID BEFORE THIS: nothing. `ProductInfo` printed
 * "אזל מהמלאי", disabled the button, and the visit ended there. Somebody came
 * for a specific thing, it was not there, and the shop learned nothing -- not
 * that the product is wanted, not by how many people.
 *
 * MEASURED 2026-09-09, and it is why this is small: no active product is at
 * zero stock. 44 active, 0 sold out, 19 with `stock_quantity IS NULL` and
 * therefore never sold out by construction. The branch exists in the UI and
 * production does not currently reach it. This is built for the first time it
 * does.
 *
 * NO ACCOUNT REQUIRED. A guest can want a restock, and demanding a signup at
 * that moment converts the only signal of interest into a form nobody fills.
 * `user_id` is recorded when there happens to be one.
 */

const schema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  email: z.string().email('כתובת מייל לא תקינה').max(254),
})

export type WaitlistState = { ok: boolean; message?: string; error?: string }

/**
 * The SAME answer for every outcome that is not a validation error.
 *
 * Added, already on the list, unknown product, table not there yet: one
 * sentence. A caller who could tell those apart could ask this endpoint
 * "is this address watching this product", which is somebody else's business,
 * and could enumerate which product ids exist. The action is a mailbox, not a
 * lookup.
 */
const SAME_ANSWER: WaitlistState = {
  ok: true,
  message: 'נודיע לכם במייל ברגע שהמוצר יחזור למלאי.',
}

async function runJoinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const parsed = schema.safeParse({
    productId: formData.get('product_id'),
    variantId: formData.get('variant_id') || null,
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'כתובת מייל לא תקינה' }
  }

  const ip = await getClientIp()
  // The same reason the newsletter box has one, and it is not abstract: this
  // endpoint ends in mail to an address the submitter chose. Without a ceiling
  // it is a free way to point our domain at a stranger's inbox, and the
  // restock mail is the payload.
  if (!(await checkRateLimit(`waitlist:${ip}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const {
    data: { user } = { user: null },
  } = await (await createClient()).auth.getUser()

  const { error } = await createAdminClient().rpc(
    'join_stock_waitlist' as never,
    {
      p_product_id: parsed.data.productId,
      p_email: parsed.data.email,
      p_variant_id: parsed.data.variantId ?? null,
      p_user_id: user?.id ?? null,
    } as never,
  )

  if (error) {
    // 42883 / PGRST202 is 195 not being applied yet, and it is the expected
    // state on the day this ships. Warned once and answered as success: the
    // visitor cannot act on an unapplied migration, and a red error on a page
    // that already told them the product is gone is two pieces of bad news for
    // one problem.
    const notApplied = error.code === '42883' || error.code === 'PGRST202'
    log[notApplied ? 'warn' : 'error']('waitlist.join_failed', {
      reason: error.message,
      detail: notApplied ? '195 is written and not applied' : undefined,
    })
  }

  return SAME_ANSWER
}

export async function joinWaitlist(
  prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  return withActionContext('waitlist.join', () => runJoinWaitlist(prev, formData))
}
