import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Account export and deletion. Israeli Privacy Law ss. 13-14 plus GDPR arts.
 * 15 and 17 for visitors in the EEA. The payload is assembled from tables the
 * shopper already owns under RLS. Card numbers never appear: payment_tokens
 * stores a Cardcom token and last-4, and even those stay out of the export.
 */

const PAN_KEYS = ['card_number', 'pan', 'full_number', 'cvv', 'cvc', 'cardcom_token'] as const

export type DataExport = {
  exported_at: string
  profile: Record<string, unknown> | null
  orders: Record<string, unknown>[]
  vouchers: Record<string, unknown>[]
  wallet_entries: Record<string, unknown>[]
}

function assertNoPan(value: unknown, path: string): void {
  if (value == null) return
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoPan(item, `${path}[${i}]`))
    return
  }
  if (typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PAN_KEYS.includes(key as (typeof PAN_KEYS)[number])) {
      throw new Error(`PAN field leaked into export at ${path}.${key}`)
    }
    assertNoPan(child, `${path}.${key}`)
  }
}

export async function exportAccountData(userId: string): Promise<DataExport> {
  const supabase = await createClient()
  const [{ data: profile }, { data: orders }, { data: vouchers }, { data: wallet }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, full_name, phone, role, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id, status, created_at, paid_at, total_agorot, total_ils')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('vouchers')
        .select('id, code, status, expires_at, issued_at')
        .eq('user_id', userId)
        .order('issued_at', { ascending: false })
        .limit(200),
      supabase
        .from('v_wallet_ledger')
        .select('id, created_at, amount_ils, reason, order_id, direction')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

  const payload: DataExport = {
    exported_at: new Date().toISOString(),
    profile: profile ?? null,
    orders: (orders as Record<string, unknown>[] | null) ?? [],
    vouchers: (vouchers as Record<string, unknown>[] | null) ?? [],
    wallet_entries: (wallet as Record<string, unknown>[] | null) ?? [],
  }
  assertNoPan(payload, 'export')
  return payload
}

export async function deleteAccountData(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const stamp = new Date().toISOString()
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: 'חשבון שנמחק',
      phone: null,
      email: `deleted+${userId.slice(0, 8)}@invalid.invalid`,
    })
    .eq('id', userId)
  if (profileError) return { ok: false, error: profileError.message }

  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError) return { ok: false, error: authError.message }

  try {
    await admin.from('audit_log').insert({
      action: 'deleted',
      entity_type: 'profile',
      entity_id: userId,
      actor_id: userId,
      metadata: { at: stamp, kind: 'account.self_delete' },
    })
  } catch {
    // The account is already gone. A journal row must not undo that.
  }

  return { ok: true }
}

export { PAN_KEYS, assertNoPan }
