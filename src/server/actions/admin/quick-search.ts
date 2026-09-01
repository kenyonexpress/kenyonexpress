'use server'

import { requireSection } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { likeContains, sanitizeOrTerm } from '@/lib/utils/search-escape'
import { z } from 'zod'

/**
 * Find an order from anywhere in the panel, by the three things a person on the
 * phone actually has: an invoice number, an email address, or a phone number.
 *
 * WHY IT IS NOT THE ORDERS PAGE FILTER. That filter is a page you have to
 * navigate to first, and it does not search phone at all. This is for the case
 * where somebody is already on hold.
 *
 * The service client is used deliberately: `requireSection` has already proved
 * the caller is an admin, and the search crosses `orders` and `profiles`, where
 * the RLS path would need a join the anon key cannot express. The guard is the
 * gate; the client is the tool.
 */

const inputSchema = z.object({
  term: z.string().trim().min(2, 'לפחות שני תווים').max(80),
})

export type QuickSearchHit = {
  orderId: string
  invoiceNumber: string | null
  status: string
  createdAt: string
  customerName: string | null
  customerEmail: string | null
  /** Which field matched, so the operator can see why a row is in the list. */
  matchedOn: 'invoice' | 'customer'
}

export type QuickSearchResult = { hits: QuickSearchHit[] } | { error: string }

/** Digits only, for comparing a typed phone against a stored one. */
function digits(value: string): string {
  return value.replace(/\D/g, '')
}

async function run(raw: unknown): Promise<QuickSearchResult> {
  try {
    await requireSection('orders', 'read')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  const term = parsed.data.term
  const admin = createAdminClient()

  // Customers first: an email or a phone identifies a person, and a person may
  // have several orders. A phone is matched on digits alone, because nobody
  // types the separators the same way twice and the stored value is not
  // normalised.
  const safeTerm = sanitizeOrTerm(term)
  const phoneDigits = digits(term)

  const orFilters = [`full_name.ilike.%${safeTerm}%`, `email.ilike.%${safeTerm}%`]
  if (phoneDigits.length >= 6) orFilters.push(`phone.ilike.%${phoneDigits}%`)

  const { data: people } = safeTerm
    ? await admin.from('profiles').select('id, full_name, email').or(orFilters.join(',')).limit(20)
    : { data: [] }

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]))
  const userIds = [...peopleById.keys()]

  // Two reads rather than one `.or()` spanning both shapes: an invoice match is
  // exact-ish and must never be crowded out of the list by twenty orders
  // belonging to a customer whose name happens to contain the same substring.
  const [byInvoice, byCustomer] = await Promise.all([
    admin
      .from('orders')
      .select('id, invoice_number, status, created_at, user_id')
      .ilike('invoice_number', likeContains(term))
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    userIds.length
      ? admin
          .from('orders')
          .select('id, invoice_number, status, created_at, user_id')
          .in('user_id', userIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const seen = new Set<string>()
  const hits: QuickSearchHit[] = []

  const push = (
    row: {
      id: string
      invoice_number: string | null
      status: string
      created_at: string
      user_id: string | null
    },
    matchedOn: QuickSearchHit['matchedOn'],
  ) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    const person = row.user_id ? peopleById.get(row.user_id) : undefined
    hits.push({
      orderId: row.id,
      invoiceNumber: row.invoice_number,
      status: row.status,
      createdAt: row.created_at,
      customerName: person?.full_name ?? null,
      customerEmail: person?.email ?? null,
      matchedOn,
    })
  }

  for (const row of byInvoice.data ?? []) push(row, 'invoice')
  for (const row of byCustomer.data ?? []) push(row, 'customer')

  return { hits: hits.slice(0, 20) }
}

export async function quickSearchOrders(raw: unknown): Promise<QuickSearchResult> {
  return withActionContext('admin.quick_search', () => run(raw))
}
