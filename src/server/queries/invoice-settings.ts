import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reading and writing `customer_invoice_settings` (migration 239, pending).
 *
 * TABLE ABSENT MEANS "NO OPINION RECORDED", THE SAME ANSWER AN EMPTY TABLE
 * GIVES. Read from the account settings page (through the request-scoped
 * client, RLS-checked) and from the invoice build (through the admin client,
 * service role) -- neither may error just because 239 has not applied yet;
 * both degrade to "issue the invoice to the account holder's own name",
 * which is exactly today's behaviour.
 */

/** Postgres undefined_table, and PostgREST's schema-cache equivalents. */
const TABLE_ABSENT = new Set(['42P01', 'PGRST205', 'PGRST106'])

export interface InvoiceSettings {
  invoiceToBusiness: boolean
  businessName: string | null
  businessRegistrationNumber: string | null
}

const DEFAULT_SETTINGS: InvoiceSettings = {
  invoiceToBusiness: false,
  businessName: null,
  businessRegistrationNumber: null,
}

type Client = Pick<SupabaseClient, 'from'>

export async function getInvoiceSettings(client: Client, userId: string): Promise<InvoiceSettings> {
  const { data, error } = await client
    .from('customer_invoice_settings' as never)
    .select('invoice_to_business, business_name, business_registration_number')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    if (!TABLE_ABSENT.has(error.code ?? '')) {
      throw new Error(`customer_invoice_settings read failed: ${error.message}`)
    }
    return DEFAULT_SETTINGS
  }
  if (!data) return DEFAULT_SETTINGS

  const row = data as unknown as {
    invoice_to_business: boolean
    business_name: string | null
    business_registration_number: string | null
  }
  return {
    invoiceToBusiness: row.invoice_to_business,
    businessName: row.business_name,
    businessRegistrationNumber: row.business_registration_number,
  }
}
