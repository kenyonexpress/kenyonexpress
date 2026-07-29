# ARCHITECTURE-NOTIFICATIONS.md

KenyonExpress **notifications** architecture (binding Resend + Trigger + Edge Function).

Status: BINDING · worktree `/Users/ofir/kenyonexpress-web/ke-arch-notifications` · branch `arch/notifications` (2026-07-30)
Scope: **docs only.** Full TypeScript / SQL / HTML below is the implementation contract.
Companions: `ke-arch/docs/ARCHITECTURE-NOTIFICATIONS.md`, migration `031_notifications.sql`, redemption + checkout arch docs.

Stack: **Resend** (email) + **Supabase Database Trigger** (emit) + **Edge Function** (drain worker). No Make. No Zapier.
Optional twin: Vercel cron `POST /api/cron/notifications-worker` with the same drain code.

Money rules in templates:

| Rule | Copy consequence |
|---|---|
| Coupon paid in full on site | Show "שולם באתר ₪X.XX" from snapshot |
| No Escrow | Never say נאמן / Escrow / release of coupon prepaid to supplier |
| Dynamic `platform_percent` | Never hardcode 5%/10%; use `order_items` snapshot |
| Till remainder | "יתרה בבית העסק" only; not platform custody |
| Agorot in DB | ILS with 2 decimals in HTML |

---

## 0. Pipeline

```
Domain mutation commits (paid / issue / redeem / payout)
  -> AFTER trigger or SECURITY DEFINER emit
  -> INSERT notification_events (dedupe_key UNIQUE)
  -> fanout INSERT notification_log (idempotency_key UNIQUE)
  -> Edge Function drain (CRON_SECRET / JWT)
  -> Resend API (Idempotency-Key = notification_log.id)
  -> status sent | retry | dead (DLQ)
  -> on dead: Ntfy admin
```

Rules:

1. Money paths **must not await Resend**. Enqueue only.
2. Worker uses service role. Browser never sees `RESEND_API_KEY`.
3. At-least-once enqueue; exactly-once customer effect via idempotency keys.

---

## 1. Event catalog (required templates)

| event_type | Template key | Audience | Subject (he) |
|---|---|---|---|
| `order.paid` | `customer.order_paid` | customer | אישור הזמנה · {order_short} |
| `coupon.issued` | `customer.coupon_issued` | customer | הקופון שלך מוכן (+ QR) |
| `order.paid` (receipt fold) | `customer.receipt` | customer | קבלה · הזמנה {order_short} |
| `order.physical_supplier_alert` | `supplier.new_order` | supplier | הזמנה חדשה · {order_short} |
| `payout.sent` | `supplier.payout_transferred` | supplier | פיצול תשלום הועבר · {statement_short} |

Also in pipeline (templates optional in v1 body): `coupon.redeemed`, `coupon.expired`, `order.refunded`.

---

## 2. Schema: `notification_log` + events + DLQ

```sql
-- 089_notifications_resend_edge.sql (idempotent draft)

CREATE TABLE IF NOT EXISTS public.notification_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key  text NOT NULL UNIQUE,
  event_type  text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  user_id     uuid,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   text NOT NULL UNIQUE,
  event_id          uuid NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  event_type        text NOT NULL,
  template_key      text NOT NULL,
  channel           text NOT NULL DEFAULT 'email'
                      CHECK (channel IN ('email', 'inapp', 'ntfy')),
  locale            text NOT NULL DEFAULT 'he',
  recipient_user_id uuid,
  recipient_email   text,
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'sending', 'sent', 'retry', 'dead', 'skipped')),
  attempt_count     int NOT NULL DEFAULT 0,
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  last_error        text,
  provider_message_id text,
  amount_agorot     int,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz
);

CREATE INDEX IF NOT EXISTS notification_log_due_idx
  ON public.notification_log (next_attempt_at)
  WHERE status IN ('queued', 'retry');

CREATE TABLE IF NOT EXISTS public.notification_delivery_dlq (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id          uuid NOT NULL REFERENCES public.notification_log(id),
  event_type      text NOT NULL,
  template_key    text NOT NULL,
  recipient_email text,
  payload         jsonb NOT NULL,
  last_error      text,
  attempt_count   int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_dlq FORCE ROW LEVEL SECURITY;

-- Admin read; no client writes
DROP POLICY IF EXISTS notification_log_admin_select ON public.notification_log;
CREATE POLICY notification_log_admin_select ON public.notification_log
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS notification_events_admin_select ON public.notification_events;
CREATE POLICY notification_events_admin_select ON public.notification_events
  FOR SELECT TO authenticated USING (public.is_admin());
```

### Retry schedule

| Attempt | Delay |
|---|---|
| 1 | immediate |
| 2 | 2 min |
| 3 | 4 min |
| 4 | 8 min |
| 5 | 16 min |
| 6 | 32 min then `dead` + DLQ |

---

## 3. Emit trigger (order paid example)

```sql
CREATE OR REPLACE FUNCTION public.trg_notify_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('paid', 'succeeded') THEN

    INSERT INTO public.notification_events (dedupe_key, event_type, entity_type, entity_id, user_id, payload)
    VALUES (
      'order.paid:' || NEW.id::text,
      'order.paid',
      'orders',
      NEW.id,
      NEW.user_id,
      jsonb_build_object(
        'order_id', NEW.id,
        'paid_on_site_agorot', NEW.total_agorot,
        'currency', 'ILS'
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NOT NULL THEN
      PERFORM public.fn_fanout_notification(v_event_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_notify_paid ON public.orders;
CREATE TRIGGER orders_notify_paid
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_order_paid();
```

Fanout creates `notification_log` rows for customer email (+ supplier physical alert rows when applicable).

---

## 4. Shared email chrome (RTL Hebrew)

```typescript
// supabase/functions/notifications-worker/templates/_layout.ts
export function ilsFromAgorot(agorot: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(agorot / 100)
}

export function emailShell(opts: {
  title: string
  preheader: string
  bodyHtml: string
}): { subject: string; html: string; text: string } {
  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#333e48;">
  <div style="display:none;max-height:0;overflow:hidden;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#fed700;padding:16px 24px;font-size:18px;font-weight:700;color:#333e48;">
          קניון אקספרס
        </td></tr>
        <tr><td style="padding:24px;font-size:16px;line-height:1.6;text-align:right;">
          ${opts.bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;font-size:12px;color:#666;text-align:right;border-top:1px solid #eee;">
          מייל זה נשלח אוטומטית. אין להשיב ישירות.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = opts.preheader + '\n\n' + opts.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return { subject: opts.title, html, text }
}
```

---

## 5. Full templates

### 5.1 אישור הזמנה (`customer.order_paid`)

```typescript
// supabase/functions/notifications-worker/templates/order-paid.ts
import { emailShell, ilsFromAgorot } from './_layout.ts'

export type OrderPaidPayload = {
  customer_name: string
  order_short: string
  order_id: string
  paid_on_site_agorot: number
  lines: Array<{
    name_he: string
    product_type: 'coupon' | 'physical'
    qty: number
    paid_agorot: number
    balance_due_agorot?: number
  }>
  account_url: string
}

export function renderOrderPaid(p: OrderPaidPayload) {
  const linesHtml = p.lines
    .map((l) => {
      const till =
        l.product_type === 'coupon' && (l.balance_due_agorot ?? 0) > 0
          ? `<div style="font-size:13px;color:#666;">יתרה בבית העסק: ${ilsFromAgorot(l.balance_due_agorot!)}</div>`
          : ''
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">
          <strong>${l.name_he}</strong> × ${l.qty}
          <div>שולם באתר: ${ilsFromAgorot(l.paid_agorot)}</div>
          ${till}
        </td>
      </tr>`
    })
    .join('')

  return emailShell({
    title: `אישור הזמנה · ${p.order_short}`,
    preheader: `התשלום התקבל להזמנה ${p.order_short}`,
    bodyHtml: `
      <p>שלום ${p.customer_name},</p>
      <p>קיבלנו את התשלום. מספר הזמנה: <strong>${p.order_short}</strong></p>
      <p style="font-size:20px;font-weight:700;">סה״כ שולם באתר: ${ilsFromAgorot(p.paid_on_site_agorot)}</p>
      <table role="presentation" width="100%">${linesHtml}</table>
      <p style="margin-top:24px;">
        <a href="${p.account_url}" style="display:inline-block;background:#333e48;color:#fed700;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">
          לאזור האישי
        </a>
      </p>
    `,
  })
}
```

### 5.2 קופון + QR (`customer.coupon_issued`)

```typescript
// supabase/functions/notifications-worker/templates/coupon-issued.ts
import { emailShell, ilsFromAgorot } from './_layout.ts'

export type CouponIssuedPayload = {
  customer_name: string
  product_name_he: string
  code: string
  expires_at_he: string
  paid_on_site_agorot: number
  balance_due_agorot: number
  /** Absolute HTTPS URL to account voucher / PNG of QR */
  qr_image_url: string
  voucher_url: string
}

export function renderCouponIssued(p: CouponIssuedPayload) {
  return emailShell({
    title: `הקופון שלך מוכן · ${p.product_name_he}`,
    preheader: `קוד ${p.code} מוכן לשימוש עד ${p.expires_at_he}`,
    bodyHtml: `
      <p>שלום ${p.customer_name},</p>
      <p>הקופון <strong>${p.product_name_he}</strong> מוכן.</p>
      <p style="text-align:center;margin:24px 0;">
        <img src="${p.qr_image_url}" alt="QR לקופון" width="220" height="220" style="display:inline-block;border:0;" />
      </p>
      <p style="font-size:22px;letter-spacing:2px;text-align:center;font-weight:700;">${p.code}</p>
      <ul style="padding-right:18px;">
        <li>שולם באתר: ${ilsFromAgorot(p.paid_on_site_agorot)}</li>
        <li>יתרה בבית העסק: ${ilsFromAgorot(p.balance_due_agorot)}</li>
        <li>בתוקף עד: ${p.expires_at_he}</li>
      </ul>
      <p>
        <a href="${p.voucher_url}" style="display:inline-block;background:#333e48;color:#fed700;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">
          לפתיחת הקופון באזור האישי
        </a>
      </p>
      <p style="font-size:13px;color:#666;">המימוש הסופי מתבצע בסריקה אצל בית העסק. צילום מסך אינו מחליף אימות בשרת.</p>
    `,
  })
}
```

### 5.3 קבלה (`customer.receipt`)

```typescript
// supabase/functions/notifications-worker/templates/receipt.ts
import { emailShell, ilsFromAgorot } from './_layout.ts'

export type ReceiptPayload = {
  customer_name: string
  order_short: string
  paid_at_he: string
  paid_on_site_agorot: number
  payment_last4?: string | null
  lines: Array<{ name_he: string; qty: number; paid_agorot: number }>
}

export function renderReceipt(p: ReceiptPayload) {
  const rows = p.lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:6px 0;text-align:right;">${l.name_he} × ${l.qty}</td>
          <td style="padding:6px 0;text-align:left;">${ilsFromAgorot(l.paid_agorot)}</td>
        </tr>`,
    )
    .join('')

  return emailShell({
    title: `קבלה · הזמנה ${p.order_short}`,
    preheader: `קבלה על תשלום ${ilsFromAgorot(p.paid_on_site_agorot)}`,
    bodyHtml: `
      <p>שלום ${p.customer_name},</p>
      <p>זו קבלה על תשלום שבוצע באתר קניון אקספרס.</p>
      <p>הזמנה: <strong>${p.order_short}</strong><br/>תאריך: ${p.paid_at_he}
      ${p.payment_last4 ? `<br/>כרטיס מסתיים ב־${p.payment_last4}` : ''}</p>
      <table role="presentation" width="100%">${rows}</table>
      <p style="font-size:18px;font-weight:700;margin-top:16px;">סה״כ: ${ilsFromAgorot(p.paid_on_site_agorot)}</p>
    `,
  })
}
```

### 5.4 ספק: הזמנה חדשה (`supplier.new_order`)

```typescript
// supabase/functions/notifications-worker/templates/supplier-new-order.ts
import { emailShell, ilsFromAgorot } from './_layout.ts'

export type SupplierNewOrderPayload = {
  supplier_name: string
  order_short: string
  customer_city?: string | null
  lines: Array<{
    name_he: string
    qty: number
    paid_on_site_agorot: number
    platform_percent: number
    supplier_due_agorot: number
  }>
  portal_url: string
}

export function renderSupplierNewOrder(p: SupplierNewOrderPayload) {
  const rows = p.lines
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">
            <strong>${l.name_he}</strong> × ${l.qty}<br/>
            שולם באתר: ${ilsFromAgorot(l.paid_on_site_agorot)} · עמלה (סנאפשוט): ${l.platform_percent}%<br/>
            יתרת ספק משוערת: ${ilsFromAgorot(l.supplier_due_agorot)}
          </td>
        </tr>`,
    )
    .join('')

  return emailShell({
    title: `הזמנה חדשה · ${p.order_short}`,
    preheader: `הזמנה פיזית חדשה עבור ${p.supplier_name}`,
    bodyHtml: `
      <p>שלום צוות ${p.supplier_name},</p>
      <p>התקבלה הזמנה חדשה לפיזי. מספר: <strong>${p.order_short}</strong>
      ${p.customer_city ? `<br/>עיר למשלוח: ${p.customer_city}` : ''}</p>
      <table role="presentation" width="100%">${rows}</table>
      <p>
        <a href="${p.portal_url}" style="display:inline-block;background:#333e48;color:#fed700;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">
          לפורטל הספק
        </a>
      </p>
    `,
  })
}
```

### 5.5 ספק: פיצול תשלום הועבר (`supplier.payout_transferred`)

```typescript
// supabase/functions/notifications-worker/templates/supplier-payout.ts
import { emailShell, ilsFromAgorot } from './_layout.ts'

export type SupplierPayoutPayload = {
  supplier_name: string
  statement_short: string
  period_he: string
  payout_agorot: number
  portal_url: string
}

export function renderSupplierPayout(p: SupplierPayoutPayload) {
  return emailShell({
    title: `פיצול תשלום הועבר · ${p.statement_short}`,
    preheader: `הועבר ${ilsFromAgorot(p.payout_agorot)} לתקופה ${p.period_he}`,
    bodyHtml: `
      <p>שלום ${p.supplier_name},</p>
      <p>בוצעה העברת הפיצול לתקופה <strong>${p.period_he}</strong>.</p>
      <p style="font-size:22px;font-weight:700;">סכום שהועבר: ${ilsFromAgorot(p.payout_agorot)}</p>
      <p>מזהה דוח: ${p.statement_short}</p>
      <p style="font-size:13px;color:#666;">הסכום מבוסס על יתרות ספק מצילומי הזמנה (ללא מקדמות קופון).</p>
      <p>
        <a href="${p.portal_url}" style="display:inline-block;background:#333e48;color:#fed700;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">
          לפירוט בפורטל
        </a>
      </p>
    `,
  })
}
```

Template router:

```typescript
// supabase/functions/notifications-worker/templates/index.ts
import { renderOrderPaid } from './order-paid.ts'
import { renderCouponIssued } from './coupon-issued.ts'
import { renderReceipt } from './receipt.ts'
import { renderSupplierNewOrder } from './supplier-new-order.ts'
import { renderSupplierPayout } from './supplier-payout.ts'

export function renderTemplate(templateKey: string, payload: Record<string, unknown>) {
  switch (templateKey) {
    case 'customer.order_paid':
      return renderOrderPaid(payload as never)
    case 'customer.coupon_issued':
      return renderCouponIssued(payload as never)
    case 'customer.receipt':
      return renderReceipt(payload as never)
    case 'supplier.new_order':
      return renderSupplierNewOrder(payload as never)
    case 'supplier.payout_transferred':
      return renderSupplierPayout(payload as never)
    default:
      throw new Error(`unknown template_key: ${templateKey}`)
  }
}
```

---

## 6. Edge Function (full drain worker)

```typescript
// supabase/functions/notifications-worker/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { renderTemplate } from './templates/index.ts'

const RESEND_API = 'https://api.resend.com/emails'
const MAX_ATTEMPTS = 6
const DELAYS_MS = [0, 2, 4, 8, 16, 32].map((m) => m * 60_000)

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function assertAuth(req: Request) {
  const secret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    throw new Response('unauthorized', { status: 401 })
  }
}

async function sendResend(input: {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
}) {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM') ?? 'KenyonExpress <noreply@kenyonexpress.co.il>'
  if (!key) throw new Error('RESEND_API_KEY missing')

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(typeof body?.message === 'string' ? body.message : `resend ${res.status}`)
    ;(err as { status?: number }).status = res.status
    throw err
  }
  return body as { id?: string }
}

async function notifyNtfy(title: string, body: string) {
  const topic = Deno.env.get('NTFY_ADMIN_TOPIC') ?? 'kenyon-ofir-limit'
  const base = Deno.env.get('NTFY_BASE_URL') ?? 'https://ntfy.sh'
  const token = Deno.env.get('NTFY_TOKEN')
  const headers: Record<string, string> = {
    Title: title,
    Priority: '4',
    Tags: 'email,warning',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  await fetch(`${base}/${topic}`, { method: 'POST', headers, body: body.slice(0, 2000) }).catch(() => {})
}

Deno.serve(async (req) => {
  try {
    assertAuth(req)
  } catch (r) {
    return r as Response
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Claim due rows
  const { data: due, error } = await supabase.rpc('fn_claim_notification_batch', { p_limit: 25 })
  if (error) return json({ ok: false, error: error.message }, 500)

  const rows = (due ?? []) as Array<{
    id: string
    template_key: string
    recipient_email: string
    payload: Record<string, unknown>
    attempt_count: number
    idempotency_key: string
    event_type: string
  }>

  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      if (!row.recipient_email) {
        await supabase
          .from('notification_log')
          .update({ status: 'skipped', last_error: 'missing email', updated_at: new Date().toISOString() })
          .eq('id', row.id)
        continue
      }

      const rendered = renderTemplate(row.template_key, row.payload)
      const provider = await sendResend({
        to: row.recipient_email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: row.id,
      })

      await supabase
        .from('notification_log')
        .update({
          status: 'sent',
          provider_message_id: provider.id ?? null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', row.id)
      sent++
    } catch (e) {
      failed++
      const attempt = (row.attempt_count ?? 0) + 1
      const message = e instanceof Error ? e.message : String(e)

      if (attempt >= MAX_ATTEMPTS) {
        await supabase
          .from('notification_log')
          .update({
            status: 'dead',
            attempt_count: attempt,
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)

        await supabase.from('notification_delivery_dlq').insert({
          log_id: row.id,
          event_type: row.event_type,
          template_key: row.template_key,
          recipient_email: row.recipient_email,
          payload: row.payload,
          last_error: message,
          attempt_count: attempt,
        })

        await notifyNtfy('SEV2 notification DLQ', `${row.template_key} ${row.id}: ${message}`)
      } else {
        const delay = DELAYS_MS[Math.min(attempt, DELAYS_MS.length - 1)]
        await supabase
          .from('notification_log')
          .update({
            status: 'retry',
            attempt_count: attempt,
            next_attempt_at: new Date(Date.now() + delay).toISOString(),
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
      }
    }
  }

  return json({ ok: true, claimed: rows.length, sent, failed })
})
```

Claim RPC:

```sql
CREATE OR REPLACE FUNCTION public.fn_claim_notification_batch(p_limit int DEFAULT 25)
RETURNS SETOF public.notification_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.notification_log
    WHERE status IN ('queued', 'retry')
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(p_limit, 1), 100)
  )
  UPDATE public.notification_log n
  SET status = 'sending',
      updated_at = now(),
      attempt_count = n.attempt_count  -- incremented on failure path
  FROM due
  WHERE n.id = due.id
  RETURNING n.*;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_notification_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_notification_batch(int) TO service_role;
```

Schedule (Supabase cron or Vercel): every minute `POST` with `Authorization: Bearer $CRON_SECRET`.

---

## 7. Security

| Control | Rule |
|---|---|
| Secrets | `RESEND_API_KEY`, `CRON_SECRET`, service role: Edge secrets / Vercel only |
| Auth on worker | Bearer `CRON_SECRET` required |
| RLS | `notification_log` / DLQ: admin SELECT only; writes service/definer |
| PII | Prefer account deep links over embedding full QR token in email when possible |
| Idempotency | Unique keys + Resend Idempotency-Key = log id |
| Template allow-list | Worker only renders known `template_key` values |
| No client Resend | Never call Resend from browser |
| Money copy | Snapshots only; no Escrow language |

---

## 8. Acceptance

- [ ] Paid order enqueues without blocking Cardcom finalize
- [ ] Five templates render RTL Hebrew
- [ ] Coupon mail includes QR image + code + till remainder
- [ ] Supplier new-order and payout mails use snapshotted percent / agorot
- [ ] Retry backoff then DLQ + Ntfy
- [ ] Duplicate worker run does not double-email (idempotency)
- [ ] Edge Function rejects missing Bearer

---

## 9. Related paths

```
supabase/migrations/089_notifications_resend_edge.sql
supabase/functions/notifications-worker/index.ts
supabase/functions/notifications-worker/templates/_layout.ts
supabase/functions/notifications-worker/templates/order-paid.ts
supabase/functions/notifications-worker/templates/coupon-issued.ts
supabase/functions/notifications-worker/templates/receipt.ts
supabase/functions/notifications-worker/templates/supplier-new-order.ts
supabase/functions/notifications-worker/templates/supplier-payout.ts
supabase/functions/notifications-worker/templates/index.ts
```

---

## 10. Open questions

1. Fold receipt into order_paid as one email, or always send both with skip_folded?
2. Host QR PNGs on R2 signed URLs with short TTL vs CID inline?
3. Prefer Supabase `pg_cron` vs Vercel cron for the drain?
