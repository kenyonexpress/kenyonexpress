import { formatAgorot } from '@/lib/vouchers/coupon-view'

/**
 * The Twilio Content Templates this store may send over WhatsApp (STEP 17).
 *
 * WHY TEMPLATES AT ALL. WhatsApp delivers free text only inside the 24-hour
 * customer-service window that opens when the CUSTOMER writes to us. Every
 * proactive message outside it (a payment confirmation, a parcel on its way)
 * must be a template Meta approved in advance, sent by ContentSid with
 * positional variables, or Twilio refuses it with error 63016. So the outbox
 * drain sends a template when one is configured, free text only while a
 * window is open, and otherwise parks the row until the SID arrives.
 *
 * POST-PURCHASE ONLY, BY CONSTRUCTION. This catalogue is the whole list. It
 * carries the order lifecycle (paid, shipped, delivered, cancelled, refunded)
 * and the owner's support alert, all of Meta's UTILITY category. Nothing
 * here is marketing: no price drop, no back-in-stock, no voucher promotion,
 * no welcome. `templates.test.ts` pins that; a marketing template needs a
 * separate opt-in the consent table does not record, and adding one here
 * would send it under a consent the customer never gave.
 *
 * VARIABLES ARE PLAIN STRINGS. Meta rejects a parameter that carries a
 * newline, a tab or more than four consecutive spaces, and Twilio rejects an
 * empty one, so every value passes through `variable()` before it is sent.
 * Money arrives in agorot and only formatAgorot renders it; nothing here
 * divides by 100.
 *
 * THE BODY TEXT IS DOCUMENTATION, NOT A SEND. The `body` of each entry is the
 * Hebrew Ofir submits to Meta through the Twilio console; the approved SID
 * then lands in the named env var. Until it does, `contentSidFor` returns
 * null and the drain falls back or waits. docs/WHATSAPP-TEMPLATES.md renders
 * the same catalogue for the person doing the submitting.
 */

export const WHATSAPP_TEMPLATE_KINDS = [
  'order_paid',
  'order_shipped',
  'order_fulfilled',
  'order_cancelled',
  'order_refunded',
  'support_inbound',
] as const

export type WhatsAppTemplateKind = (typeof WHATSAPP_TEMPLATE_KINDS)[number]

export interface WhatsAppTemplateSpec {
  kind: WhatsAppTemplateKind
  /** The env var that holds the approved ContentSid (HX...). */
  envVar: string
  /** Meta's template category. Every entry is UTILITY; the test pins it. */
  category: 'UTILITY'
  /** Who receives it: the customer who bought, or the store owner. */
  audience: 'customer' | 'owner'
  /** The Hebrew body submitted for approval, with {{n}} placeholders. */
  body: string
  /** What each positional variable carries, for the submission form. */
  variables: readonly string[]
}

const OPT_OUT_LINE = 'להסרה מעדכוני וואטסאפ השיבו: הסר'

/** The greeting when the profile has no name. Plural is the neutral form. */
const NAME_FALLBACK = 'לקוחות יקרים'

export const TEMPLATE_CATALOGUE: readonly WhatsAppTemplateSpec[] = [
  {
    kind: 'order_paid',
    envVar: 'TWILIO_CONTENT_SID_ORDER_PAID',
    category: 'UTILITY',
    audience: 'customer',
    body: `שלום {{1}}, התשלום התקבל והזמנה {{2}} נקלטה. סך ההזמנה: {{3}}. נעדכן כאן כשההזמנה תצא לדרך. ${OPT_OUT_LINE}`,
    variables: ['שם הלקוח', 'מספר הזמנה (8 תווים)', 'סך ההזמנה בשקלים'],
  },
  {
    kind: 'order_shipped',
    envVar: 'TWILIO_CONTENT_SID_ORDER_SHIPPED',
    category: 'UTILITY',
    audience: 'customer',
    body: `שלום {{1}}, הזמנה {{2}} יצאה לדרך. מעקב: {{3}}. ${OPT_OUT_LINE}`,
    variables: ['שם הלקוח', 'מספר הזמנה (8 תווים)', 'חברת שילוח ומספר מעקב, או "יעודכן"'],
  },
  {
    kind: 'order_fulfilled',
    envVar: 'TWILIO_CONTENT_SID_ORDER_FULFILLED',
    category: 'UTILITY',
    audience: 'customer',
    body: `שלום {{1}}, הזמנה {{2}} נמסרה. תודה שקניתם ב-KenyonExpress. אם משהו לא תקין, השיבו כאן ונטפל. ${OPT_OUT_LINE}`,
    variables: ['שם הלקוח', 'מספר הזמנה (8 תווים)'],
  },
  {
    kind: 'order_cancelled',
    envVar: 'TWILIO_CONTENT_SID_ORDER_CANCELLED',
    category: 'UTILITY',
    audience: 'customer',
    body: `שלום {{1}}, הזמנה {{2}} בוטלה. אם לא ביקשתם זאת, השיבו כאן ונבדוק. ${OPT_OUT_LINE}`,
    variables: ['שם הלקוח', 'מספר הזמנה (8 תווים)'],
  },
  {
    kind: 'order_refunded',
    envVar: 'TWILIO_CONTENT_SID_ORDER_REFUNDED',
    category: 'UTILITY',
    audience: 'customer',
    body: `שלום {{1}}, בוצע זיכוי על הזמנה {{2}}. ההופעה בדף החשבון תלויה בחברת האשראי. ${OPT_OUT_LINE}`,
    variables: ['שם הלקוח', 'מספר הזמנה (8 תווים)'],
  },
  {
    kind: 'support_inbound',
    envVar: 'TWILIO_CONTENT_SID_SUPPORT_INBOUND',
    category: 'UTILITY',
    audience: 'owner',
    body: 'פנייה חדשה בוואטסאפ מ-{{1}} (פנייה {{2}}): {{3}}',
    variables: ['מספר הטלפון של הלקוח', 'מספר הפנייה (8 תווים)', 'תוכן ההודעה, עד 300 תווים'],
  },
]

const BY_KIND: ReadonlyMap<string, WhatsAppTemplateSpec> = new Map(
  TEMPLATE_CATALOGUE.map((spec) => [spec.kind, spec]),
)

export function templateSpec(kind: string): WhatsAppTemplateSpec | null {
  return BY_KIND.get(kind) ?? null
}

/** The approved ContentSid for a kind, or null while approval is pending. */
export function contentSidFor(
  kind: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string | null {
  const spec = BY_KIND.get(kind)
  if (!spec) return null
  const sid = env[spec.envVar]?.trim()
  return sid && sid.length > 0 ? sid : null
}

/**
 * One value as Meta accepts it: no line breaks or tabs, no run of spaces,
 * never empty, capped well under the 1024-character parameter limit.
 */
export function variable(value: unknown, fallback = '-', max = 300): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  const flat = text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
  if (flat === '') return fallback
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function orderRef(payload: Record<string, unknown>): string | null {
  return (
    asText(payload.order_ref) ??
    asText(
      String(payload.order_id ?? '')
        .slice(0, 8)
        .toUpperCase(),
    )
  )
}

/** `{ carrier, tracking_number }[]` to one line: "דואר ישראל 123, DHL 456". */
function shipmentsVariable(value: unknown): string {
  if (!Array.isArray(value)) return 'יעודכן'
  const parts: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const tracking = asText(record.tracking_number)
    if (!tracking) continue
    const carrier = asText(record.carrier)
    parts.push(carrier ? `${carrier} ${tracking}` : tracking)
  }
  return parts.length > 0 ? parts.join(', ') : 'יעודכן'
}

export interface WhatsAppTemplateMessage {
  contentSid: string
  /** Positional, keyed '1', '2', ... as Twilio's ContentVariables wants. */
  variables: Record<string, string>
}

/**
 * The template send for a queued outbox row, or null when the kind has no
 * template, the payload cannot fill it, or the SID is not configured yet.
 * The drain treats the three nulls differently (see the route), so callers
 * that need the distinction ask `templateSpec` and `contentSidFor` first.
 */
export function buildWhatsAppTemplate(
  kind: string,
  payload: Record<string, unknown>,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): WhatsAppTemplateMessage | null {
  const contentSid = contentSidFor(kind, env)
  if (!contentSid) return null

  if (kind === 'support_inbound') {
    const phone = asText(payload.phone)
    const ticketRef = asText(payload.ticket_ref)
    if (!phone || !ticketRef) return null
    return {
      contentSid,
      variables: {
        '1': variable(phone),
        '2': variable(ticketRef),
        '3': variable(payload.body, '(הודעה ריקה)'),
      },
    }
  }

  const ref = orderRef(payload)
  if (!ref) return null
  const name = variable(payload.customer_name, NAME_FALLBACK, 80)

  switch (kind as WhatsAppTemplateKind) {
    case 'order_paid': {
      const total = Number(payload.total_agorot)
      return {
        contentSid,
        variables: {
          '1': name,
          '2': variable(ref),
          '3': Number.isFinite(total) && total > 0 ? formatAgorot(total) : '-',
        },
      }
    }
    case 'order_shipped':
      return {
        contentSid,
        variables: { '1': name, '2': variable(ref), '3': shipmentsVariable(payload.shipments) },
      }
    case 'order_fulfilled':
    case 'order_cancelled':
    case 'order_refunded':
      return { contentSid, variables: { '1': name, '2': variable(ref) } }
    default:
      return null
  }
}

/**
 * The catalogue body with its placeholders filled: what the customer will
 * read once Meta approves it. Used by the docs and by the tests that keep
 * the free-text fallback and the template saying the same thing.
 */
export function renderTemplatePreview(kind: string, variables: Record<string, string>): string {
  const spec = BY_KIND.get(kind)
  if (!spec) return ''
  return spec.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => variables[n] ?? `{{${n}}}`)
}
