import { loadCardcomEnv } from '@/lib/payments/env'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Multi-account Cardcom registry.
 *
 * The platform holds its own Cardcom terminal (env credentials, key
 * 'platform'); a supplier MAY have a dedicated terminal row in
 * public.cardcom_accounts. Charges and refunds resolve the account by
 * supplier; webhooks resolve it by the terminal number Cardcom echoes in the
 * payload. Every resolution falls back to the platform account, so a missing
 * row can never block a checkout: it only means the money flows through the
 * platform terminal and is split by the ledger instead of at the acquirer.
 */

export const PLATFORM_ACCOUNT_KEY = 'platform'

export type CardcomAccount = {
  key: string
  supplierId: string | null
  terminalNumber: string
  apiName: string
  apiPassword: string
  webhookSecret: string
}

type CardcomAccountRow = {
  key: string
  supplier_id: string | null
  terminal_number: string
  api_name: string
  api_password: string
  webhook_secret: string
  is_active: boolean
}

// The admin (service-role) client; cardcom_accounts has no RLS policies on
// purpose, so only this client can read credentials.
type AdminLike = Pick<SupabaseClient, 'from'>

export function platformAccountFromEnv(): CardcomAccount {
  const env = loadCardcomEnv()
  return {
    key: PLATFORM_ACCOUNT_KEY,
    supplierId: null,
    terminalNumber: env.terminalNumber,
    apiName: env.apiName,
    apiPassword: env.apiPassword,
    webhookSecret: env.webhookSecret,
  }
}

function fromRow(row: CardcomAccountRow): CardcomAccount {
  return {
    key: row.key,
    supplierId: row.supplier_id,
    terminalNumber: row.terminal_number,
    apiName: row.api_name,
    apiPassword: row.api_password,
    webhookSecret: row.webhook_secret,
  }
}

/**
 * The account that should CHARGE for a given supplier's lines.
 * No dedicated row (or an inactive one) resolves to the platform account.
 */
export async function resolveAccountForSupplier(
  admin: AdminLike,
  supplierId: string | null,
): Promise<CardcomAccount> {
  if (!supplierId) return platformAccountFromEnv()
  const { data } = await admin
    .from('cardcom_accounts')
    .select('key, supplier_id, terminal_number, api_name, api_password, webhook_secret, is_active')
    .eq('supplier_id', supplierId)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return platformAccountFromEnv()
  return fromRow(data as CardcomAccountRow)
}

/**
 * The account a payment row says charged it (payments.cardcom_account_key).
 * Verification MUST run on the same terminal that charged; an unknown or
 * inactive key resolves to the platform account, matching the charge-time
 * fallback.
 */
export async function resolveAccountByKey(
  admin: AdminLike,
  key: string | null | undefined,
): Promise<CardcomAccount> {
  if (!key || key === PLATFORM_ACCOUNT_KEY) return platformAccountFromEnv()
  const { data } = await admin
    .from('cardcom_accounts')
    .select('key, supplier_id, terminal_number, api_name, api_password, webhook_secret, is_active')
    .eq('key', key)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return platformAccountFromEnv()
  return fromRow(data as CardcomAccountRow)
}

/**
 * The account a webhook claims to come from (payload terminal number).
 * Used ONLY to pick the signature secret; an unknown terminal resolves to the
 * platform account so legacy single-terminal callbacks keep verifying.
 */
export async function resolveAccountByTerminal(
  admin: AdminLike,
  terminalNumber: string | number | null | undefined,
): Promise<CardcomAccount> {
  const platform = platformAccountFromEnv()
  if (terminalNumber === null || terminalNumber === undefined) return platform
  const asText = String(terminalNumber)
  if (asText === platform.terminalNumber) return platform
  const { data } = await admin
    .from('cardcom_accounts')
    .select('key, supplier_id, terminal_number, api_name, api_password, webhook_secret, is_active')
    .eq('terminal_number', asText)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return platform
  return fromRow(data as CardcomAccountRow)
}
