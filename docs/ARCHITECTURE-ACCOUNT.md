# ARCHITECTURE-ACCOUNT.md

KenyonExpress **My Account** architecture (binding customer dashboard spec).

Status: BINDING · worktree `/Users/ofir/kenyonexpress-web/ke-arch-account` · branch `arch/account` (2026-07-30)
Scope: **docs only.** No application code in this change.
Companions: `docs/ARCHITECTURE-CART-CHECKOUT.md` (ke-arch-cart), `docs/ARCHITECTURE-ACCOUNT-IDENTITY.md`, `docs/ARCHITECTURE-ACCOUNT-WALLET.md`, cardcom-payments skill.
Stack: Next.js App Router route group `(account)`, Server Components + Server Actions, request-scoped Supabase client + RLS, Cardcom tokens (display only), integer **agorot** money.

Includes **Part II** (Auth Google, RLS matrix, Account details, Logout, Order detail full TS, loading shells).

Primary surfaces covered here:

| Route | Job |
|---|---|
| `/account` | Overview dashboard |
| `/account/orders` + `/account/orders/[id]` | Orders |
| `/account/coupons` | Coupons / vouchers + QR |
| `/account/addresses` | Shipping addresses CRUD |
| `/account/tokens` | Saved payment methods (Cardcom tokens) |

Also in shell nav (brief): `/account/details`, `/account/wallet`. Privacy / notifications: see Identity companion.

---

## 0. Binding principles

1. **Auth gate on the layout.** Every `/account/**` page requires `supabase.auth.getUser()`. Guests redirect to `/login?next=/account...`. Guest cart stays open elsewhere; identity starts here and at Pay.
2. **RLS is the real boundary.** Account reads/writes use the **request-scoped** user client. Never `adminClient` for customer PII screens except where a documented exception exists (today: some order joins under service role filtered by `user_id`; target: pure RLS).
3. **No PAN, no CVV, ever.** Payment methods show brand + last4 + expiry. Token column is not selectable by authenticated role.
4. **Money is integer agorot** in DB and domain types. UI formats ₪ via `he-IL` (`formatIlsFromAgorot`). Do not invent float totals in the account layer.
5. **Coupon lifecycle:** `issued` → `used` (scan). Legacy aliases `active`/`redeemed` map in labels only.
6. **Wallet is site credit only.** No cash-out, no P2P transfer. Mutations only via payment finalize / admin RPC, never from account UI.
7. **RTL Hebrew** throughout. `dir="rtl"`, Asia/Jerusalem dates.
8. **Soft-delete addresses.** Orders keep historical `address_id`; UI lists `deleted_at IS NULL` only.

---

## 1. Information architecture

```
(account)/layout.tsx          require session + AccountNav + shell
  /account                    overview (wallet chip, last order, active coupons)
  /account/details            profile name + phone (email read-only) + Logout
  /account/orders             order list
  /account/orders/[id]        order detail + lines + vouchers QR
  /account/coupons            voucher wallet (tabs: issued | used | expired)
  /account/wallet             balance + ledger (companion)
  /account/addresses          AddressManager
  /account/tokens             TokenManager
  /account/privacy            export + deletion (Identity companion)
  /account/notifications      prefs (Identity companion)
```

Nav labels (Hebrew, binding):

| href | label |
|---|---|
| `/account` | סקירה |
| `/account/details` | הפרטים שלי |
| `/account/orders` | ההזמנות שלי |
| `/account/coupons` | הקופונים שלי |
| `/account/wallet` | הארנק שלי |
| `/account/addresses` | כתובות |
| `/account/tokens` | אמצעי תשלום |

---

## 2. Auth + layout contract

```
Browser → GET /account/**
  → layout: createClient().auth.getUser()
  → if !user: redirect(/login?next=<path>)
  → parallel: getCart(), getAccountProfile(), getWalletSummary()
  → render SiteHeader + AccountNav + children + CartDrawer
```

Rules:

- Prefer `getUser()` over `getSession()` on the server.
- `proxy.ts` may also protect `/account*`; layout remains the hard gate.
- Wallet badge in nav: `balance_agorot / 100` display only.
- Deletion-pending banner (if `account_deletion_requests.status = pending`): show cancel CTA (Identity).

---

## 3. Overview dashboard (`/account`)

One composition job: answer "מה המצב שלי עכשיו?"

Widgets (server-rendered):

1. Wallet balance strip (link to `/account/wallet`)
2. Last order card (or empty)
3. Active coupons count (status in `issued`/`active` and `expires_at > now()`)
4. Orders count shortcut

Empty copy (Hebrew):

- No orders: `עוד לא ביצעת הזמנות.`
- No coupons: `אין כרגע קופונים שממתינים למימוש`

No marketing cards, no promo strips, no stats beyond those four signals.

---

## 4. Orders

### 4.1 List (`/account/orders`)

Source: `orders` where `user_id = auth.uid()` and `deleted_at IS NULL`, newest first, limit 50.

Row fields:

| Field | Source |
|---|---|
| total display | `total_agorot` |
| date | `created_at` |
| item count | sum `order_items.quantity` |
| settlement chip | derive from line `settlement_status` |
| has vouchers | any line `product_type = coupon` |

Settlement display tones:

| status | label | tone |
|---|---|---|
| `pending` | ממתינה לתשלום | warn |
| `paid` | שולמה | ok |
| `split_executed` | הושלמה | ok |
| `redeemed` | מומשה | ok |
| `refunded` | זוכתה | dead |
| `cancelled` | בוטלה | dead |

Legacy DB values `escrow_held` / `escrow_released` / `platform_settled` map to `split_executed` in the reader (no Escrow in current money model).

### 4.2 Detail (`/account/orders/[id]`)

Ownership check: order.user_id must equal session user (404 otherwise; never leak existence across users if avoidable: prefer 404).

Per line:

- Product name snapshot, type badge (קופון / פיזי)
- `paid_on_site_agorot`, `balance_due_agorot` (coupon remainder at business)
- Snapshotted `platform_percent` (read-only, not editable)
- Physical: item_status timeline (pending → shipped → delivered)
- Coupon: linked vouchers with QR data URL generated server-side from signed token / code

Actions: none that mutate settlement. Customer cannot "cancel paid order" from UI without support path (edge case → open ticket / admin).

### 4.3 Empty + loading

- `loading.tsx`: skeleton rows (RTL)
- Empty list: CTA to `/` catalog

---

## 5. Coupons (`/account/coupons`)

Canonical table: **`vouchers`** (not legacy `coupon_codes` write path). RLS: `user_id = auth.uid()`.

### 5.1 Status model

| DB status | UI label | Tab |
|---|---|---|
| `issued` (legacy `active`) | פעיל | פעילים |
| `used` (legacy `redeemed`) | מומש | מומשו |
| `expired` | פג תוקף | פגו |
| `refunded` | זוכה | פגו |

### 5.2 Card content

- Product name (`products.name_he`)
- Manual code (spaced groups for readability)
- QR rendered client or server from `code` / `qr_token`
- Expiry (`expires_at`) Asia/Jerusalem
- Paid on site: `coupon_price_agorot`
- Due at business: `remaining_amount_due_agorot` (never platform custody)
- Face: `face_value_agorot`

Invariant: `face = coupon_price + remaining_amount_due` (agorot integers).

### 5.3 Offline note

Active vouchers may be mirrored to IndexedDB for basement-no-signal display. Redemption always validates online at supplier scan. Cached used vouchers must not appear in the active tab.

### 5.4 Security

QR is a **presentation bearer**. Single-use enforcement is DB-side on redeem. Screenshots are expected; do not pretend QR secrecy is the control.

---

## 6. Addresses (`/account/addresses`)

Table: `user_addresses`. Soft delete via `deleted_at`.

Israeli fields (binding):

`full_name`, `phone`, `street`, `street_number`, `apartment`, `entrance`, `floor`, `city`, `zip`, `notes_for_courier`, `is_default`

Rules:

- At most one `is_default = true` per user among non-deleted rows (clear others before set).
- Phone validation: Israeli mobile/landline regex (see Zod schema below).
- Delete is soft; default flag cleared on delete.
- Checkout prefers default address when cart has physical lines.

---

## 7. Payment methods (`/account/tokens`)

Table: `payment_tokens`.

Customer-visible columns only:

`id`, `last_4`, `card_brand`, `expiry_month`, `expiry_year`, `is_default`, `created_at`

Never select `cardcom_token` in account queries.

Actions:

| Action | Mechanism |
|---|---|
| Set default | clear others + set row (or RPC `fn_set_default_payment_token`) |
| Delete | DELETE under owner RLS; optionally revoke at Cardcom via service job |
| Add card | **No card form.** Opens Cardcom Low Profile tokenize flow; webhook inserts token |

Expired cards: show chip `פג תוקף`; block set-default.

---

## 8. Domain types (agorot-first)

```typescript
/** 1 ILS = 100 agorot. Domain money never uses float. */
export type Agorot = number & { readonly __brand: 'Agorot' }

export function agorot(n: number): Agorot {
  if (!Number.isInteger(n) || n < 0) throw new TypeError('agorot must be non-negative integer')
  return n as Agorot
}

export function formatIlsFromAgorot(value: Agorot | number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(Number(value) / 100)
}

export type VoucherStatus = 'issued' | 'used' | 'expired' | 'refunded'

export type AccountProfile = {
  id: string
  email: string
  fullName: string | null
  phone: string | null
  avatarUrl: string | null
}

export type WalletSummary = {
  balanceAgorot: Agorot
  accountId: string | null
}

export type OrderSummary = {
  id: string
  status: string
  settlementStatus: string
  createdAt: string
  paidAt: string | null
  totalAgorot: Agorot
  itemCount: number
  hasVouchers: boolean
}

export type AccountVoucher = {
  code: string
  status: VoucherStatus | string
  expiresAt: string
  faceValueAgorot: Agorot
  couponPriceAgorot: Agorot
  remainingDueAgorot: Agorot
  redeemedAt: string | null
  productName: string | null
  qrDataUrl: string | null
}

export type AccountAddress = {
  id: string
  fullName: string
  phone: string
  street: string
  streetNumber: string | null
  apartment: string | null
  entrance: string | null
  floor: string | null
  city: string
  zip: string | null
  notesForCourier: string | null
  isDefault: boolean
}

export type AccountPaymentToken = {
  id: string
  last4: string | null
  cardBrand: string | null
  expiryMonth: number | null
  expiryYear: number | null
  isDefault: boolean
  createdAt: string
}
```

---

## 9. Full TypeScript (binding reference)

> Target paths under the app package. This document is the contract.

### 9.1 `src/lib/account/format.ts`

```typescript
export function formatIlsFromAgorot(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(value / 100)
}

/** @deprecated Prefer formatIlsFromAgorot. Accepts ILS float for transitional UI. */
export function formatIls(value: number): string {
  return `₪${value.toFixed(2)}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'לא זמין'
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date(iso))
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'לא זמין'
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date(iso))
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתינה לתשלום',
  paid: 'שולמה',
  split_executed: 'הושלמה',
  redeemed: 'מומשה',
  refunded: 'זוכתה',
  cancelled: 'בוטלה',
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status
}

export function orderStatusTone(status: string): 'ok' | 'warn' | 'dead' {
  if (status === 'cancelled' || status === 'refunded') return 'dead'
  if (status === 'pending') return 'warn'
  return 'ok'
}

const COUPON_STATUS_LABELS: Record<string, string> = {
  issued: 'פעיל',
  active: 'פעיל',
  used: 'מומש',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  refunded: 'זוכה',
}

export function couponStatusLabel(status: string): string {
  return COUPON_STATUS_LABELS[status] ?? status
}

export function couponStatusTone(status: string): 'ok' | 'warn' | 'dead' {
  if (status === 'issued' || status === 'active') return 'ok'
  if (status === 'used' || status === 'redeemed') return 'warn'
  return 'dead'
}

export function normalizeVoucherStatus(raw: string): 'issued' | 'used' | 'expired' | 'refunded' | string {
  if (raw === 'active') return 'issued'
  if (raw === 'redeemed') return 'used'
  return raw
}
```

### 9.2 `src/lib/validations/account.ts`

```typescript
import { z } from 'zod'

const phoneSchema = z
  .string()
  .trim()
  .min(9, 'מספר טלפון קצר מדי')
  .max(15, 'מספר טלפון ארוך מדי')
  .regex(/^(\+?972|0)[-\s]?\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/, 'מספר טלפון לא תקין')

export const profileDetailsSchema = z.object({
  full_name: z.string().trim().min(2, 'יש להזין שם מלא').max(80, 'השם ארוך מדי'),
  phone: phoneSchema,
})

export const addressSchema = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(2, 'יש להזין שם מלא').max(80),
  phone: phoneSchema,
  street: z.string().trim().min(2, 'יש להזין רחוב').max(120),
  street_number: z.string().trim().max(10).optional().or(z.literal('')),
  apartment: z.string().trim().max(10).optional().or(z.literal('')),
  entrance: z.string().trim().max(10).optional().or(z.literal('')),
  floor: z.string().trim().max(10).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'יש להזין עיר').max(80),
  zip: z.string().trim().max(10).optional().or(z.literal('')),
  notes_for_courier: z.string().trim().max(200).optional().or(z.literal('')),
  is_default: z.coerce.boolean().optional(),
})

export const idSchema = z.object({ id: z.string().uuid('מזהה לא תקין') })

export type AccountActionState = { error: string } | { success: string } | null
```

### 9.3 `src/server/queries/account.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import type {
  AccountAddress,
  AccountPaymentToken,
  AccountProfile,
  AccountVoucher,
  WalletSummary,
} from '@/lib/account/types'
import { agorot } from '@/lib/money/agorot'
import { normalizeVoucherStatus } from '@/lib/account/format'

export const WALLET_REASON_LABELS: Record<string, string> = {
  order_cashback: 'קאשבק על רכישה',
  order_spend: 'שימוש בארנק',
  order_refund: 'החזר על ביטול',
  admin_credit: 'זיכוי ידני',
  coupon_expired: 'קרדיט על קופון שפג',
}

export function walletReasonLabel(reason: string): string {
  return WALLET_REASON_LABELS[reason] ?? reason
}

export async function getAccountProfile(): Promise<AccountProfile | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    avatarUrl: data.avatar_url,
  }
}

export async function getWalletSummary(): Promise<WalletSummary> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { balanceAgorot: agorot(0), accountId: null }

  const { data } = await supabase
    .from('wallet_accounts')
    .select('id, balance_agorot')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    balanceAgorot: agorot(Number(data?.balance_agorot ?? 0)),
    accountId: data?.id ?? null,
  }
}

export async function getMyAddresses(): Promise<AccountAddress[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('user_addresses')
    .select(
      'id, full_name, phone, street, street_number, apartment, entrance, floor, city, zip, notes_for_courier, is_default',
    )
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((a) => ({
    id: a.id,
    fullName: a.full_name,
    phone: a.phone,
    street: a.street,
    streetNumber: a.street_number,
    apartment: a.apartment,
    entrance: a.entrance,
    floor: a.floor,
    city: a.city,
    zip: a.zip,
    notesForCourier: a.notes_for_courier,
    isDefault: a.is_default,
  }))
}

export async function getMyPaymentTokens(): Promise<AccountPaymentToken[]> {
  const supabase = await createClient()
  // Explicit columns: never select cardcom_token
  const { data } = await supabase
    .from('payment_tokens')
    .select('id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((t) => ({
    id: t.id,
    last4: t.last_4,
    cardBrand: t.card_brand,
    expiryMonth: t.expiry_month,
    expiryYear: t.expiry_year,
    isDefault: t.is_default,
    createdAt: t.created_at,
  }))
}

export async function getMyCoupons(): Promise<AccountVoucher[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vouchers')
    .select(
      'code, status, expires_at, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot, redeemed_at, products(name_he)',
    )
    .order('issued_at', { ascending: false })
    .limit(100)

  return (data ?? []).map((c) => {
    const product = c.products as { name_he: string } | { name_he: string }[] | null
    const productName = Array.isArray(product)
      ? (product[0]?.name_he ?? null)
      : (product?.name_he ?? null)
    return {
      code: c.code,
      status: normalizeVoucherStatus(c.status),
      expiresAt: c.expires_at,
      faceValueAgorot: agorot(Number(c.face_value_agorot ?? 0)),
      couponPriceAgorot: agorot(Number(c.coupon_price_agorot ?? 0)),
      remainingDueAgorot: agorot(Number(c.remaining_amount_due_agorot ?? 0)),
      redeemedAt: c.redeemed_at,
      productName,
      qrDataUrl: null,
    }
  })
}
```

### 9.4 `src/server/queries/orders.ts` (account-facing)

```typescript
import { createClient } from '@/lib/supabase/server'
import { agorot } from '@/lib/money/agorot'
import type { OrderSummary } from '@/lib/account/types'
import {
  SETTLEMENT_STATES,
  type SettlementState,
  deriveOrderStatus,
} from '@/server/domain/orders/state-machine'

function asSettlementState(value: string | null | undefined): SettlementState {
  const legacy: Record<string, SettlementState> = {
    escrow_held: 'split_executed',
    escrow_released: 'split_executed',
    platform_settled: 'split_executed',
  }
  const mapped = legacy[value ?? '']
  if (mapped) return mapped
  return SETTLEMENT_STATES.includes(value as SettlementState)
    ? (value as SettlementState)
    : 'pending'
}

export async function getMyOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: orders } = await supabase
    .from('orders')
    .select(
      'id, status, created_at, paid_at, total_agorot, order_items(quantity, product_type, settlement_status)',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  return (orders ?? []).map((order) => {
    const items = order.order_items ?? []
    return {
      id: order.id,
      status: order.status,
      settlementStatus: deriveOrderStatus(items.map((i) => asSettlementState(i.settlement_status))),
      createdAt: order.created_at,
      paidAt: order.paid_at,
      totalAgorot: agorot(Number(order.total_agorot ?? 0)),
      itemCount: items.reduce((sum: number, i: { quantity: number }) => sum + (i.quantity ?? 0), 0),
      hasVouchers: items.some((i: { product_type: string }) => i.product_type === 'coupon'),
    }
  })
}
```

### 9.5 `src/server/actions/account.ts`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import {
  type AccountActionState,
  addressSchema,
  idSchema,
  profileDetailsSchema,
} from '@/lib/validations/account'
import { revalidatePath } from 'next/cache'

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s === '' ? null : s
}

export async function updateProfileDetails(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = profileDetailsSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'הפרטים אינם תקינים' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq('id', userId)

  if (error) return { error: 'שמירת הפרטים נכשלה' }
  revalidatePath('/account/details')
  revalidatePath('/account')
  return { success: 'הפרטים נשמרו' }
}

export async function saveAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const rawId = formData.get('id')
  const parsed = addressSchema.safeParse({
    id: typeof rawId === 'string' && rawId !== '' ? rawId : undefined,
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    street: formData.get('street'),
    street_number: formData.get('street_number') ?? '',
    apartment: formData.get('apartment') ?? '',
    entrance: formData.get('entrance') ?? '',
    floor: formData.get('floor') ?? '',
    city: formData.get('city'),
    zip: formData.get('zip') ?? '',
    notes_for_courier: formData.get('notes_for_courier') ?? '',
    is_default: formData.get('is_default') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'הכתובת אינה תקינה' }
  }

  const supabase = await createClient()
  const row = {
    user_id: userId,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    street: parsed.data.street,
    street_number: emptyToNull(formData.get('street_number')),
    apartment: emptyToNull(formData.get('apartment')),
    entrance: emptyToNull(formData.get('entrance')),
    floor: emptyToNull(formData.get('floor')),
    city: parsed.data.city,
    zip: emptyToNull(formData.get('zip')),
    notes_for_courier: emptyToNull(formData.get('notes_for_courier')),
    is_default: parsed.data.is_default ?? false,
  }

  if (row.is_default) {
    await supabase
      .from('user_addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .is('deleted_at', null)
  }

  const { error } = parsed.data.id
    ? await supabase.from('user_addresses').update(row).eq('id', parsed.data.id)
    : await supabase.from('user_addresses').insert(row)

  if (error) return { error: 'שמירת הכתובת נכשלה' }
  revalidatePath('/account/addresses')
  return { success: parsed.data.id ? 'הכתובת עודכנה' : 'הכתובת נוספה' }
}

export async function deleteAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כתובת לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('user_addresses')
    .update({ is_default: false, deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.id)

  if (error) return { error: 'מחיקת הכתובת נכשלה' }
  revalidatePath('/account/addresses')
  return { success: 'הכתובת נמחקה' }
}

export async function setDefaultAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כתובת לא תקין' }

  const supabase = await createClient()
  await supabase
    .from('user_addresses')
    .update({ is_default: false })
    .eq('user_id', userId)
    .is('deleted_at', null)

  const { error } = await supabase
    .from('user_addresses')
    .update({ is_default: true })
    .eq('id', parsed.data.id)

  if (error) return { error: 'עדכון ברירת המחדל נכשל' }
  revalidatePath('/account/addresses')
  return { success: 'הכתובת נקבעה כברירת מחדל' }
}

export async function deletePaymentToken(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כרטיס לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.from('payment_tokens').delete().eq('id', parsed.data.id)
  if (error) return { error: 'מחיקת הכרטיס נכשלה' }

  revalidatePath('/account/tokens')
  return { success: 'הכרטיס הוסר' }
}

export async function setDefaultPaymentToken(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כרטיס לא תקין' }

  const supabase = await createClient()
  await supabase.from('payment_tokens').update({ is_default: false }).eq('profile_id', userId)
  const { error } = await supabase
    .from('payment_tokens')
    .update({ is_default: true })
    .eq('id', parsed.data.id)

  if (error) return { error: 'עדכון ברירת המחדל נכשל' }
  revalidatePath('/account/tokens')
  return { success: 'הכרטיס נקבע כברירת מחדל' }
}
```

### 9.6 `src/components/account/AccountNav.tsx`

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatIlsFromAgorot } from '@/lib/account/format'

const ITEMS = [
  { href: '/account', label: 'סקירה' },
  { href: '/account/details', label: 'הפרטים שלי' },
  { href: '/account/orders', label: 'ההזמנות שלי' },
  { href: '/account/coupons', label: 'הקופונים שלי' },
  { href: '/account/wallet', label: 'הארנק שלי' },
  { href: '/account/addresses', label: 'כתובות' },
  { href: '/account/tokens', label: 'אמצעי תשלום' },
] as const

export default function AccountNav({
  fullName,
  email,
  walletBalanceAgorot,
}: {
  fullName: string | null
  email: string
  walletBalanceAgorot: number
}) {
  const pathname = usePathname()

  return (
    <nav className="account-nav" aria-label="ניווט באזור האישי">
      <div className="account-nav__head">
        <p className="account-nav__name">{fullName || 'שלום'}</p>
        <p className="account-nav__email">{email}</p>
      </div>
      <ul className="account-nav__list">
        {ITEMS.map((item) => {
          const isActive =
            item.href === '/account' ? pathname === '/account' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`account-nav__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.href === '/account/wallet' && (
                  <span className="account-nav__badge">
                    {formatIlsFromAgorot(walletBalanceAgorot)}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

### 9.7 `src/app/(account)/layout.tsx`

```typescript
import AccountNav from '@/components/account/AccountNav'
import CartDrawer from '@/components/cart/CartDrawer'
import { CartProvider } from '@/components/cart/CartProvider'
import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import WhatsAppFloat from '@/components/shared/WhatsAppFloat'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import { getAccountProfile, getWalletSummary } from '@/server/queries/account'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import '@/styles/account.css'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/account')}`)
  }

  const [cart, profile, wallet] = await Promise.all([
    getCart(),
    getAccountProfile(),
    getWalletSummary(),
  ])

  return (
    <CartProvider initialCart={cart} isAuthenticated>
      <div className="min-h-screen flex flex-col bg-white">
        <SiteHeader />
        <main className="flex-1 w-full">
          <div className="account-page">
            <div className="account-page__inner">
              <nav className="account-page__crumb" aria-label="פירורי לחם">
                <Link href="/">עמוד הבית</Link>
                <span aria-hidden="true"> ‹ </span>
                <span>האזור האישי</span>
              </nav>

              <div className="account-shell">
                <AccountNav
                  fullName={profile?.fullName ?? null}
                  email={profile?.email ?? user.email ?? ''}
                  walletBalanceAgorot={wallet.balanceAgorot}
                />
                <div className="account-content">{children}</div>
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
      <CartDrawer />
      <WhatsAppFloat />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </CartProvider>
  )
}
```

### 9.8 Overview page

```typescript
import { formatDate, formatIlsFromAgorot, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { getMyCoupons, getWalletSummary } from '@/server/queries/account'
import { getMyOrders } from '@/server/queries/orders'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

export default async function AccountOverviewPage() {
  const [wallet, orders, coupons] = await Promise.all([
    getWalletSummary(),
    getMyOrders(),
    getMyCoupons(),
  ])

  const lastOrder = orders[0] ?? null
  const activeCoupons = coupons.filter(
    (c) =>
      (c.status === 'issued' || c.status === 'active') &&
      new Date(c.expiresAt) > new Date(),
  )

  return (
    <>
      <h1 className="account-title">האזור האישי</h1>
      <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">יתרת הארנק</p>
        <p className="wallet-balance__amount">{formatIlsFromAgorot(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.</p>
      </div>

      <div className="account-grid">
        <section className="account-card">
          <h2 className="account-card__title">ההזמנה האחרונה</h2>
          {lastOrder ? (
            <>
              <p className="account-row__title">
                {formatIlsFromAgorot(lastOrder.totalAgorot)}{' '}
                <span className={`account-chip account-chip--${orderStatusTone(lastOrder.settlementStatus)}`}>
                  {orderStatusLabel(lastOrder.settlementStatus)}
                </span>
              </p>
              <p className="account-row__meta">
                {formatDate(lastOrder.createdAt)} · {lastOrder.itemCount} פריטים
              </p>
              <p style={{ marginTop: 12 }}>
                <Link className="account-btn" href={`/account/orders/${lastOrder.id}`}>
                  לפרטי ההזמנה
                </Link>
              </p>
            </>
          ) : (
            <p className="account-row__meta">עוד לא ביצעת הזמנות.</p>
          )}
        </section>

        <section className="account-card">
          <h2 className="account-card__title">קופונים פעילים</h2>
          <p className="account-row__title">{activeCoupons.length}</p>
          <p className="account-row__meta">
            {activeCoupons.length > 0
              ? 'מוכנים לסריקה בבית העסק'
              : 'אין כרגע קופונים שממתינים למימוש'}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/coupons">
              לכל הקופונים
            </Link>
          </p>
        </section>

        <section className="account-card">
          <h2 className="account-card__title">סך ההזמנות</h2>
          <p className="account-row__title">{orders.length}</p>
          <p className="account-row__meta">היסטוריית הרכישות שלך</p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/orders">
              לכל ההזמנות
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
```

### 9.9 Orders list page

```typescript
import { formatDate, formatIlsFromAgorot, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { getMyOrders } from '@/server/queries/orders'
import Link from 'next/link'

export const metadata = { title: 'ההזמנות שלי' }

export default async function OrdersPage() {
  const orders = await getMyOrders()

  return (
    <>
      <h1 className="account-title">ההזמנות שלי</h1>
      <p className="account-subtitle">{orders.length} הזמנות</p>

      <section className="account-card">
        {orders.length === 0 ? (
          <p className="account-empty">
            עוד לא ביצעת הזמנות.{' '}
            <Link href="/">לעמוד הבית</Link>
          </p>
        ) : (
          orders.map((order) => (
            <div className="account-row" key={order.id}>
              <div className="account-row__main">
                <p className="account-row__title">
                  {formatIlsFromAgorot(order.totalAgorot)}{' '}
                  <span className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}>
                    {orderStatusLabel(order.settlementStatus)}
                  </span>
                </p>
                <p className="account-row__meta">
                  {formatDate(order.createdAt)} · {order.itemCount} פריטים
                  {order.hasVouchers ? ' · כולל קופונים' : ''}
                </p>
              </div>
              <div className="account-row__actions">
                <Link className="account-btn" href={`/account/orders/${order.id}`}>
                  פרטים
                </Link>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
```

### 9.10 Coupons page + QR card

```typescript
import {
  couponStatusLabel,
  couponStatusTone,
  formatDate,
  formatIlsFromAgorot,
} from '@/lib/account/format'
import { getMyCoupons } from '@/server/queries/account'
import { CouponQr } from '@/components/account/CouponQr'

export const metadata = { title: 'הקופונים שלי' }

export default async function CouponsPage() {
  const coupons = await getMyCoupons()
  const issued = coupons.filter((c) => c.status === 'issued' || c.status === 'active')
  const used = coupons.filter((c) => c.status === 'used' || c.status === 'redeemed')
  const other = coupons.filter(
    (c) => !issued.includes(c) && !used.includes(c),
  )

  return (
    <>
      <h1 className="account-title">הקופונים שלי</h1>
      <p className="account-subtitle">הצגת הקוד בבית העסק. היתרה משולמת שם בזמן הסריקה.</p>

      <CouponSection title="פעילים" items={issued} showQr />
      <CouponSection title="מומשו" items={used} showQr={false} />
      <CouponSection title="פגו / זוכו" items={other} showQr={false} />
    </>
  )
}

function CouponSection({
  title,
  items,
  showQr,
}: {
  title: string
  items: Awaited<ReturnType<typeof getMyCoupons>>
  showQr: boolean
}) {
  if (items.length === 0) {
    return (
      <section className="account-card">
        <h2 className="account-card__title">{title}</h2>
        <p className="account-empty">אין פריטים בקבוצה זו.</p>
      </section>
    )
  }

  return (
    <section className="account-card">
      <h2 className="account-card__title">{title}</h2>
      {items.map((coupon) => (
        <div className="account-row" key={coupon.code}>
          <div className="account-row__main">
            <p className="coupon-card__code">{coupon.code}</p>
            <p className="account-row__title">{coupon.productName ?? 'קופון'}</p>
            <p className="account-row__meta">
              <span className={`account-chip account-chip--${couponStatusTone(coupon.status)}`}>
                {couponStatusLabel(coupon.status)}
              </span>
              {' · '}בתוקף עד {formatDate(coupon.expiresAt)}
              {coupon.redeemedAt ? ` · מומש ב-${formatDate(coupon.redeemedAt)}` : ''}
            </p>
            <p className="account-row__meta">
              שולם באתר {formatIlsFromAgorot(coupon.couponPriceAgorot)}
              {coupon.remainingDueAgorot > 0
                ? ` · לתשלום בבית העסק ${formatIlsFromAgorot(coupon.remainingDueAgorot)}`
                : ''}
            </p>
            {showQr ? <CouponQr code={coupon.code} /> : null}
          </div>
          <div className="account-row__actions">
            {formatIlsFromAgorot(coupon.faceValueAgorot)}
          </div>
        </div>
      ))}
    </section>
  )
}
```

```typescript
'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function CouponQr({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(code, { margin: 1, width: 220 }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [code])

  if (!src) return <p className="account-row__meta">טוען QR…</p>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="coupon-qr" src={src} alt={`קוד QR לקופון ${code}`} width={220} height={220} />
  )
}
```

### 9.11 AddressManager (client)

```typescript
'use client'

import type { AccountActionState } from '@/lib/validations/account'
import { deleteAddress, saveAddress, setDefaultAddress } from '@/server/actions/account'
import type { AccountAddress } from '@/lib/account/types'
import { useActionState, useEffect, useState } from 'react'

const INITIAL: AccountActionState = null

function Feedback({ state }: { state: AccountActionState }) {
  if (!state) return null
  if ('error' in state) {
    return (
      <p className="account-alert account-alert--error" role="alert">
        {state.error}
      </p>
    )
  }
  return <output className="account-alert account-alert--success">{state.success}</output>
}

function AddressForm({
  address,
  onDone,
}: {
  address: AccountAddress | null
  onDone: () => void
}) {
  const [state, action, pending] = useActionState(saveAddress, INITIAL)
  const succeeded = state !== null && 'success' in state
  useEffect(() => {
    if (succeeded) onDone()
  }, [succeeded, onDone])

  return (
    <form action={action} className="account-form">
      <Feedback state={state} />
      {address ? <input type="hidden" name="id" value={address.id} /> : null}

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_full_name">שם מלא</label>
          <input className="account-field__input" id="a_full_name" name="full_name" defaultValue={address?.fullName ?? ''} required />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_phone">טלפון</label>
          <input className="account-field__input" id="a_phone" name="phone" type="tel" inputMode="tel" defaultValue={address?.phone ?? ''} required />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_street">רחוב</label>
          <input className="account-field__input" id="a_street" name="street" defaultValue={address?.street ?? ''} required />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_street_number">מספר</label>
          <input className="account-field__input" id="a_street_number" name="street_number" defaultValue={address?.streetNumber ?? ''} />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_apartment">דירה</label>
          <input className="account-field__input" id="a_apartment" name="apartment" defaultValue={address?.apartment ?? ''} />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_entrance">כניסה</label>
          <input className="account-field__input" id="a_entrance" name="entrance" defaultValue={address?.entrance ?? ''} />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_floor">קומה</label>
          <input className="account-field__input" id="a_floor" name="floor" defaultValue={address?.floor ?? ''} />
        </div>
      </div>

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_city">עיר</label>
          <input className="account-field__input" id="a_city" name="city" defaultValue={address?.city ?? ''} required />
        </div>
        <div className="account-field">
          <label className="account-field__label" htmlFor="a_zip">מיקוד</label>
          <input className="account-field__input" id="a_zip" name="zip" defaultValue={address?.zip ?? ''} />
        </div>
      </div>

      <div className="account-field">
        <label className="account-field__label" htmlFor="a_notes">הערות לשליח</label>
        <textarea className="account-field__input" id="a_notes" name="notes_for_courier" defaultValue={address?.notesForCourier ?? ''} rows={2} />
      </div>

      <label className="account-check">
        <input type="checkbox" name="is_default" defaultChecked={address?.isDefault ?? false} />
        כתובת ברירת מחדל
      </label>

      <button className="account-btn account-btn--primary" type="submit" disabled={pending}>
        {pending ? 'שומר…' : 'שמירה'}
      </button>
    </form>
  )
}

export default function AddressManager({ addresses }: { addresses: AccountAddress[] }) {
  const [editing, setEditing] = useState<AccountAddress | null | 'new'>(null)
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAddress, INITIAL)
  const [defaultState, defaultAction, defaultPending] = useActionState(setDefaultAddress, INITIAL)

  if (editing !== null) {
    return (
      <AddressForm
        address={editing === 'new' ? null : editing}
        onDone={() => setEditing(null)}
      />
    )
  }

  return (
    <div>
      <Feedback state={deleteState} />
      <Feedback state={defaultState} />
      <p style={{ marginBottom: 12 }}>
        <button className="account-btn account-btn--primary" type="button" onClick={() => setEditing('new')}>
          כתובת חדשה
        </button>
      </p>
      {addresses.length === 0 ? (
        <p className="account-empty">עדיין אין כתובות שמורות.</p>
      ) : (
        addresses.map((a) => (
          <div className="account-row" key={a.id}>
            <div className="account-row__main">
              <p className="account-row__title">
                {a.fullName}
                {a.isDefault ? <span className="account-chip account-chip--default">ברירת מחדל</span> : null}
              </p>
              <p className="account-row__meta">
                {a.street} {a.streetNumber ?? ''}, {a.city}
              </p>
              <p className="account-row__meta">{a.phone}</p>
            </div>
            <div className="account-row__actions">
              <button className="account-btn" type="button" onClick={() => setEditing(a)}>
                עריכה
              </button>
              {!a.isDefault ? (
                <form action={defaultAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="account-btn" type="submit" disabled={defaultPending}>ברירת מחדל</button>
                </form>
              ) : null}
              <form action={deleteAction}>
                <input type="hidden" name="id" value={a.id} />
                <button className="account-btn account-btn--danger" type="submit" disabled={deletePending}>
                  מחיקה
                </button>
              </form>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
```

### 9.12 TokenManager (client)

```typescript
'use client'

import type { AccountActionState } from '@/lib/validations/account'
import { deletePaymentToken, setDefaultPaymentToken } from '@/server/actions/account'
import type { AccountPaymentToken } from '@/lib/account/types'
import { useActionState } from 'react'

const INITIAL: AccountActionState = null

function Feedback({ state }: { state: AccountActionState }) {
  if (!state) return null
  if ('error' in state) {
    return (
      <p className="account-alert account-alert--error" role="alert">
        {state.error}
      </p>
    )
  }
  return <output className="account-alert account-alert--success">{state.success}</output>
}

function expiryLabel(month: number | null, year: number | null): string {
  if (!month || !year) return ''
  return `תוקף ${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

function isExpired(month: number | null, year: number | null): boolean {
  if (!month || !year) return false
  const now = new Date()
  const endOfMonth = new Date(year, month, 1)
  return endOfMonth <= new Date(now.getFullYear(), now.getMonth(), 1)
}

function TokenRow({ token }: { token: AccountPaymentToken }) {
  const [deleteState, deleteActionFn, deletePending] = useActionState(deletePaymentToken, INITIAL)
  const [defaultState, defaultActionFn, defaultPending] = useActionState(
    setDefaultPaymentToken,
    INITIAL,
  )
  const expired = isExpired(token.expiryMonth, token.expiryYear)

  return (
    <div className="account-row">
      <div className="account-row__main">
        <p className="account-row__title">
          {token.cardBrand ?? 'כרטיס אשראי'} ···· {token.last4 ?? '****'}{' '}
          {token.isDefault ? <span className="account-chip account-chip--default">ברירת מחדל</span> : null}
          {expired ? <span className="account-chip account-chip--dead">פג תוקף</span> : null}
        </p>
        <p className="account-row__meta">{expiryLabel(token.expiryMonth, token.expiryYear)}</p>
        <Feedback state={deleteState} />
        <Feedback state={defaultState} />
      </div>
      <div className="account-row__actions">
        {!token.isDefault && !expired ? (
          <form action={defaultActionFn}>
            <input type="hidden" name="id" value={token.id} />
            <button className="account-btn" type="submit" disabled={defaultPending}>
              קביעה כברירת מחדל
            </button>
          </form>
        ) : null}
        <form action={deleteActionFn}>
          <input type="hidden" name="id" value={token.id} />
          <button className="account-btn account-btn--danger" type="submit" disabled={deletePending}>
            הסרה
          </button>
        </form>
      </div>
    </div>
  )
}

export default function TokenManager({ tokens }: { tokens: AccountPaymentToken[] }) {
  if (tokens.length === 0) {
    return (
      <p className="account-empty">
        אין כרטיסים שמורים. כרטיס נשמר אוטומטית אחרי תשלום מוצלח ראשון, או דרך הוספת כרטיס ב-Cardcom.
      </p>
    )
  }
  return (
    <section className="account-card">
      {tokens.map((t) => (
        <TokenRow key={t.id} token={t} />
      ))}
    </section>
  )
}
```

### 9.13 Addresses + tokens pages

```typescript
import AddressManager from '@/components/account/AddressManager'
import { getMyAddresses } from '@/server/queries/account'

export const metadata = { title: 'כתובות' }

export default async function AddressesPage() {
  const addresses = await getMyAddresses()
  return (
    <>
      <h1 className="account-title">כתובות</h1>
      <p className="account-subtitle">למשלוח מוצרים פיזיים בלבד</p>
      <AddressManager addresses={addresses} />
    </>
  )
}
```

```typescript
import TokenManager from '@/components/account/TokenManager'
import { getMyPaymentTokens } from '@/server/queries/account'

export const metadata = { title: 'אמצעי תשלום' }

export default async function TokensPage() {
  const tokens = await getMyPaymentTokens()
  return (
    <>
      <h1 className="account-title">אמצעי תשלום</h1>
      <p className="account-subtitle">טוקנים שמורים ב-Cardcom. המספר המלא לא נשמר אצלנו.</p>
      <TokenManager tokens={tokens} />
    </>
  )
}
```

---

## 10. Edge cases

| ID | Case | Behavior |
|---|---|---|
| A1 | Unauthenticated deep link | redirect login with `next` |
| A2 | Order id of another user | 404 |
| A3 | Orders query uses wrong money column (`total_ils`) | fail loud in staging; production must use `*_agorot` |
| A4 | Coupons read `coupon_codes` instead of `vouchers` | empty UI; forbidden: use `vouchers` |
| A5 | Double default address | clear-all then set in same action |
| A6 | Soft-deleted address still in checkout picker | filter `deleted_at IS NULL` |
| A7 | Token select `*` | 42501 on token column; always explicit select |
| A8 | Expired token set-default | UI blocks; server should reject |
| A9 | Voucher used while page open | revalidate on focus / poll optional; redeem is source of truth |
| A10 | Wallet badge shows ILS float from agorot/100 rounding | display via formatter only; store agorot |
| A11 | Account deletion pending | banner + block new checkout optional (Identity) |
| A12 | Mixed order (physical + coupon) | detail shows both line types; coupons link to `/account/coupons` |

---

## 11. Migrations / schema expectations

Already expected live (do not recreate blindly):

- `profiles`, `user_addresses` (+ `deleted_at`), `payment_tokens` (column privilege on token)
- `orders` / `order_items` with `*_agorot` + `platform_percent` snapshot
- `vouchers` with `issued|used|expired|refunded`, QR fields, money agorot
- `wallet_accounts.balance_agorot`, `v_wallet_ledger`
- Owner RLS on addresses, tokens delete, vouchers read

Draft hardening if gaps remain:

```sql
-- 084_account_rls_hardening.sql (idempotent draft)
-- Ensure authenticated cannot SELECT payment_tokens.cardcom_token
-- Ensure vouchers_owner_read: user_id = auth.uid()
-- Ensure user_addresses soft-delete filter in policies
-- Partial unique: one default address per user where deleted_at is null
```

---

## 12. Security checklist

- [ ] Layout `getUser()` gate
- [ ] No `cardcom_token` in any account select
- [ ] No service role in Address/Token/Coupon list paths (target)
- [ ] Zod validation on all writes
- [ ] Soft-delete addresses only
- [ ] Order detail ownership check
- [ ] Marketing prefs opt-in only (Identity companion)

---

## 13. Acceptance checklist

- [ ] `/account` shows wallet, last order, active coupon count
- [ ] `/account/orders` lists own orders with agorot totals
- [ ] `/account/orders/[id]` shows dual price for coupons + QR when issued
- [ ] `/account/coupons` tabs issued / used / expired; QR for issued
- [ ] `/account/addresses` CRUD + single default + soft delete
- [ ] `/account/tokens` last4 only; set default; delete; no PAN
- [ ] RTL Hebrew labels; empty states in Hebrew
- [ ] Guest hitting `/account` lands on login with return path

---

## 14. Related paths (implementation)

```
src/app/(account)/layout.tsx
src/app/(account)/account/page.tsx
src/app/(account)/account/orders/page.tsx
src/app/(account)/account/orders/[id]/page.tsx
src/app/(account)/account/coupons/page.tsx
src/app/(account)/account/addresses/page.tsx
src/app/(account)/account/tokens/page.tsx
src/components/account/*
src/server/queries/account.ts
src/server/queries/orders.ts
src/server/actions/account.ts
src/lib/validations/account.ts
src/lib/account/format.ts
src/styles/account.css
```

---

## 15. Open questions

1. Should order list paginate server-side beyond 50?
2. Add-card Low Profile amount: 0 vs 1 agorot (Cardcom constraint)?
3. Offline IndexedDB for coupons: ship in web v1 or mobile-only?


---

# Part II: Expanded binding (Auth, Details, Logout, Order detail, RLS)

This part **supersedes** thinner mentions above where they conflict. Prefer Part II for Auth, Account details, Logout, Order detail TypeScript, and the RLS query matrix.

---

## 16. Auth guard: Supabase Google + session

### 16.1 Product rule

- Browse + guest cart: open.
- `/account/**` and Pay: require authenticated Supabase user.
- Primary identity path: **Google OAuth** (`openid email profile`).
- Secondary: email OTP / password (existing `auth.ts`); account UX still assumes Google-first.

### 16.2 Guard layers (defense in depth)

| Layer | Where | Behavior |
|---|---|---|
| 1. Proxy | `src/proxy.ts` | Soft redirect `/account*` → `/login?next=` |
| 2. Layout | `(account)/layout.tsx` | Hard `getUser()`; redirect if missing |
| 3. Page | e.g. details `notFound` if no profile | Fail closed |
| 4. RLS | Postgres | Queries return only `auth.uid()` rows |

**Never** use `getSession()` alone on the server for authorization.

### 16.3 Google sign-in → callback → merge cart

```
/login?next=/account
  → signInWithGoogle (Server Action)
  → Supabase OAuth redirect
  → /auth/callback?next=/account
  → exchangeCodeForSession
  → mergeGuestCart(userId, ke_session_id)
  → clear guest cookie
  → redirect(next)
```

### 16.4 Full TypeScript: Google + logout

```typescript
// src/server/actions/auth.ts (account-relevant excerpts)
'use server'

import { safeNextPath } from '@/lib/auth/safe-next'
import { GUEST_SESSION_COOKIE, getGuestSessionId } from '@/lib/cart/guest-session'
import { createClient } from '@/lib/supabase/server'
import { mergeGuestCart } from '@/server/actions/cart'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export type AuthState = { error: string } | { success: string } | null

export async function signInWithGoogle(_: AuthState, formData: FormData): Promise<AuthState> {
  const next = safeNextPath(formData.get('next'))
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: 'openid email profile',
    },
  })
  if (error) return { error: 'התחברות עם Google נכשלה' }
  if (data.url) redirect(data.url)
  return null
}

/** Sign out current browser session only. */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}

/** Sign out every device (global refresh token revoke). */
export async function signOutAll() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}
```

```typescript
// src/app/auth/callback/route.ts (contract)
import { createClient } from '@/lib/supabase/server'
import { getGuestSessionId, GUEST_SESSION_COOKIE } from '@/lib/cart/guest-session'
import { mergeGuestCart } from '@/server/actions/cart'
import { safeNextPath } from '@/lib/auth/safe-next'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNextPath(url.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      const sessionId = await getGuestSessionId()
      if (sessionId) {
        await mergeGuestCart(data.user.id, sessionId)
        const jar = await cookies()
        jar.delete(GUEST_SESSION_COOKIE)
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
```

```typescript
// src/app/(auth)/login/page.tsx (minimal account-entry)
import LoginForm from './LoginForm'

export const metadata = { title: 'התחברות' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <main dir="rtl" className="login-page">
      <h1>התחברות</h1>
      <p>התחברות עם Google נדרשת לאזור האישי ולתשלום.</p>
      <LoginForm next={next ?? '/account'} />
    </main>
  )
}
```

```typescript
// src/app/(auth)/login/LoginForm.tsx
'use client'

import { type AuthState, signInWithGoogle } from '@/server/actions/auth'
import { useActionState } from 'react'

const INITIAL: AuthState = null

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithGoogle, INITIAL)
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      {state && 'error' in state ? (
        <p className="account-alert account-alert--error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="account-btn account-btn--primary" disabled={pending}>
        {pending ? 'מעביר ל-Google…' : 'המשך עם Google'}
      </button>
    </form>
  )
}
```

---

## 17. RLS matrix (every account query)

| Query / mutation | Table / view | Policy expectation |
|---|---|---|
| `getAccountProfile` | `profiles` | `id = auth.uid()` select/update; `role` frozen on update |
| `getWalletSummary` | `wallet_accounts` | `user_id = auth.uid()` |
| ledger | `v_wallet_ledger` | filtered to caller |
| `getMyAddresses` / save / delete / default | `user_addresses` | owner CRUD; soft-delete visible filter |
| `getMyPaymentTokens` / delete / default | `payment_tokens` | owner; **no SELECT on `cardcom_token`** |
| `getMyCoupons` | `vouchers` | `user_id = auth.uid()` |
| `getMyOrders` | `orders` + `order_items` | `orders.user_id = auth.uid()` |
| `getOrderDetail` | orders/items/vouchers/products/suppliers | must enforce `user_id` (prefer RLS; if admin client used, **always** `.eq('user_id', userId)` first) |
| `updateProfileDetails` | `profiles` | owner update only |
| wallet writes | ledger RPCs | **no** authenticated write policy |

Target: eliminate admin client from customer order detail once RLS joins are sufficient.

---

## 18. Account details (`/account/details`)

### 18.1 Spec

- Editable: `full_name`, `phone` (Israeli validation).
- Read-only: `email` (from Google / Auth). Change email only via provider / Auth flows, not this form.
- Avatar: optional future; out of scope for v1 dashboard.
- Role: never shown; never writable from client.

### 18.2 Page + form (full TypeScript)

```typescript
// src/app/(account)/account/details/page.tsx
import ProfileDetailsForm from '@/components/account/ProfileDetailsForm'
import { getAccountProfile } from '@/server/queries/account'
import { notFound } from 'next/navigation'

export const metadata = { title: 'הפרטים שלי' }

export default async function DetailsPage() {
  const profile = await getAccountProfile()
  if (!profile) notFound()

  return (
    <>
      <h1 className="account-title">הפרטים שלי</h1>
      <p className="account-subtitle">שם וטלפון לשימוש בהזמנות</p>

      <section className="account-card">
        <ProfileDetailsForm
          fullName={profile.fullName}
          phone={profile.phone}
          email={profile.email}
        />
      </section>

      <section className="account-card" style={{ marginTop: 24 }}>
        <h2 className="account-card__title">יציאה מהחשבון</h2>
        <p className="account-subtitle">סיום הסשן במכשיר זה או בכל המכשירים.</p>
        {/* LogoutButtons is a client/server action form island */}
        <LogoutButtons />
      </section>
    </>
  )
}
```

```typescript
// src/components/account/ProfileDetailsForm.tsx
'use client'

import type { AccountActionState } from '@/lib/validations/account'
import { updateProfileDetails } from '@/server/actions/account'
import { useActionState } from 'react'

const INITIAL: AccountActionState = null

export default function ProfileDetailsForm({
  fullName,
  phone,
  email,
}: {
  fullName: string | null
  phone: string | null
  email: string
}) {
  const [state, action, pending] = useActionState(updateProfileDetails, INITIAL)

  return (
    <form action={action} className="account-form" dir="rtl">
      {state && 'error' in state ? (
        <p className="account-alert account-alert--error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state && 'success' in state ? (
        <output className="account-alert account-alert--success">{state.success}</output>
      ) : null}

      <div className="account-form__row">
        <div className="account-field">
          <label className="account-field__label" htmlFor="full_name">
            שם מלא
          </label>
          <input
            className="account-field__input"
            id="full_name"
            name="full_name"
            defaultValue={fullName ?? ''}
            required
            autoComplete="name"
          />
        </div>

        <div className="account-field">
          <label className="account-field__label" htmlFor="phone">
            טלפון
          </label>
          <input
            className="account-field__input"
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={phone ?? ''}
            required
            autoComplete="tel"
            placeholder="050-0000000"
          />
        </div>
      </div>

      <div className="account-field">
        <label className="account-field__label" htmlFor="email">
          אימייל
        </label>
        <input className="account-field__input" id="email" value={email} disabled readOnly />
        <p className="account-row__meta">האימייל מגיע מ-Google ולא ניתן לעריכה כאן.</p>
      </div>

      <button className="account-btn account-btn--primary" type="submit" disabled={pending}>
        {pending ? 'שומר…' : 'שמירת פרטים'}
      </button>
    </form>
  )
}
```

---

## 19. Logout

### 19.1 UX

- Primary: **יציאה** in AccountNav footer + on `/account/details`.
- Optional secondary: **יציאה מכל המכשירים** (`signOutAll`).
- After logout: redirect `/login` (not homepage) so re-auth is one click.
- Guest cart cookie is independent; do not invent a new guest id on logout unless missing.
- Clear any client `ke_cart_mirror_v1` on logout submit (best-effort).

### 19.2 Full TypeScript

```typescript
// src/components/account/LogoutButtons.tsx
import { signOut, signOutAll } from '@/server/actions/auth'

export default function LogoutButtons() {
  return (
    <div className="account-row__actions" style={{ justifyContent: 'flex-start', gap: 12 }}>
      <form action={signOut}>
        <button className="account-btn account-btn--danger" type="submit">
          יציאה
        </button>
      </form>
      <form action={signOutAll}>
        <button className="account-btn" type="submit">
          יציאה מכל המכשירים
        </button>
      </form>
    </div>
  )
}
```

```typescript
// src/components/account/AccountNav.tsx (complete, with logout)
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatIlsFromAgorot } from '@/lib/account/format'
import { signOut } from '@/server/actions/auth'

const ITEMS = [
  { href: '/account', label: 'סקירה' },
  { href: '/account/details', label: 'הפרטים שלי' },
  { href: '/account/orders', label: 'ההזמנות שלי' },
  { href: '/account/coupons', label: 'הקופונים שלי' },
  { href: '/account/wallet', label: 'הארנק שלי' },
  { href: '/account/addresses', label: 'כתובות' },
  { href: '/account/tokens', label: 'אמצעי תשלום' },
] as const

export default function AccountNav({
  fullName,
  email,
  walletBalanceAgorot,
}: {
  fullName: string | null
  email: string
  walletBalanceAgorot: number
}) {
  const pathname = usePathname()

  return (
    <nav className="account-nav" aria-label="ניווט באזור האישי" dir="rtl">
      <div className="account-nav__head">
        <p className="account-nav__name">{fullName || 'שלום'}</p>
        <p className="account-nav__email">{email}</p>
      </div>
      <ul className="account-nav__list">
        {ITEMS.map((item) => {
          const isActive =
            item.href === '/account' ? pathname === '/account' : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`account-nav__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <span>{item.label}</span>
                {item.href === '/account/wallet' ? (
                  <span className="account-nav__badge">
                    {formatIlsFromAgorot(walletBalanceAgorot)}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
      <form action={signOut} className="account-nav__logout">
        <button className="account-btn account-btn--danger" type="submit">
          יציאה
        </button>
      </form>
    </nav>
  )
}
```

---

## 20. Order detail (full route + query)

### 20.1 Types

```typescript
export type OrderLineSupplier = {
  id: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
}

export type OrderVoucher = {
  code: string
  status: string
  expiresAt: string | null
  collectAmountAgorot: number | null
  faceValueAgorot: number | null
  qrDataUrl: string | null
  usedAt: string | null
}

export type OrderLine = {
  id: string
  productId: string | null
  productName: string
  productSlug: string | null
  productImage: string | null
  productType: 'coupon' | 'physical'
  quantity: number
  unitPriceAgorot: number
  totalAgorot: number
  paidOnSiteAgorot: number
  balanceDueAgorot: number
  settlementStatus: string
  itemStatus: string
  supplier: OrderLineSupplier | null
  vouchers: OrderVoucher[]
}

export type OrderDetail = {
  id: string
  status: string
  settlementStatus: string
  createdAt: string
  paidAt: string | null
  subtotalAgorot: number
  totalAgorot: number
  walletAppliedAgorot: number
  addressId: string | null
  lines: OrderLine[]
}
```

### 20.2 `getOrderDetail` (binding)

```typescript
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { agorot } from '@/lib/money/agorot'
import {
  SETTLEMENT_STATES,
  type SettlementState,
  deriveOrderStatus,
} from '@/server/domain/orders/state-machine'
import type { OrderDetail, OrderLine, OrderVoucher } from '@/lib/account/types'

function asSettlementState(value: string | null | undefined): SettlementState {
  const legacy: Record<string, SettlementState> = {
    escrow_held: 'split_executed',
    escrow_released: 'split_executed',
    platform_settled: 'split_executed',
  }
  const mapped = legacy[value ?? '']
  if (mapped) return mapped
  return SETTLEMENT_STATES.includes(value as SettlementState)
    ? (value as SettlementState)
    : 'pending'
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null
  const first = images[0]
  return typeof first === 'string' ? first : null
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Prefer user-scoped client + RLS. If joins require elevated reads, keep the
  // user_id filter as the first predicate and never omit it.
  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, user_id, status, created_at, paid_at, subtotal_agorot, total_agorot, cashback_applied_agorot, address_id',
    )
    .eq('id', orderId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!order) return null

  const { data: items } = await supabase
    .from('order_items')
    .select(
      'id, product_id, product_type, supplier_id, quantity, unit_price_agorot, total_price_agorot, paid_on_site_agorot, balance_due_agorot, settlement_status, item_status',
    )
    .eq('order_id', order.id)

  const productIds = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as string[]
  const supplierIds = [...new Set((items ?? []).map((i) => i.supplier_id).filter(Boolean))] as string[]
  const itemIds = (items ?? []).map((i) => i.id)

  const [{ data: products }, { data: suppliers }, { data: coupons }] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id, name_he, slug, images').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name_he: string; slug: string | null; images: unknown }[] }),
    supplierIds.length
      ? supabase.from('suppliers').select('id, name, address, city, contact_phone').in('id', supplierIds)
      : Promise.resolve({ data: [] as { id: string; name: string; address: string | null; city: string | null; contact_phone: string | null }[] }),
    itemIds.length
      ? supabase
          .from('vouchers')
          .select(
            'code, status, expires_at, remaining_amount_due_agorot, face_value_agorot, qr_payload, redeemed_at, order_item_id',
          )
          .in('order_item_id', itemIds)
          .order('issued_at', { ascending: true })
      : Promise.resolve({ data: [] as Array<{
          code: string
          status: string
          expires_at: string | null
          remaining_amount_due_agorot: number | null
          face_value_agorot: number | null
          qr_payload: string | null
          redeemed_at: string | null
          order_item_id: string | null
        }> }),
  ])

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]))

  const lines: OrderLine[] = []
  for (const item of items ?? []) {
    const product = item.product_id ? productMap.get(item.product_id) : undefined
    const supplier = item.supplier_id ? supplierMap.get(item.supplier_id) : undefined
    const itemCoupons = (coupons ?? []).filter((c) => c.order_item_id === item.id)

    const vouchers: OrderVoucher[] = []
    for (const coupon of itemCoupons) {
      let qrDataUrl: string | null = null
      if (coupon.qr_payload) {
        try {
          qrDataUrl = await QRCode.toDataURL(coupon.qr_payload, { margin: 1, width: 240 })
        } catch {
          qrDataUrl = null
        }
      }
      vouchers.push({
        code: coupon.code,
        status: coupon.status,
        expiresAt: coupon.expires_at,
        collectAmountAgorot:
          coupon.remaining_amount_due_agorot == null
            ? null
            : Number(coupon.remaining_amount_due_agorot),
        faceValueAgorot:
          coupon.face_value_agorot == null ? null : Number(coupon.face_value_agorot),
        qrDataUrl,
        usedAt: coupon.redeemed_at,
      })
    }

    lines.push({
      id: item.id,
      productId: item.product_id,
      productName: product?.name_he ?? 'מוצר',
      productSlug: product?.slug ?? null,
      productImage: firstImage(product?.images),
      productType: item.product_type === 'physical' ? 'physical' : 'coupon',
      quantity: item.quantity,
      unitPriceAgorot: Number(item.unit_price_agorot ?? 0),
      totalAgorot: Number(item.total_price_agorot ?? 0),
      paidOnSiteAgorot: Number(item.paid_on_site_agorot ?? 0),
      balanceDueAgorot: Number(item.balance_due_agorot ?? 0),
      settlementStatus: asSettlementState(item.settlement_status),
      itemStatus: item.item_status,
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            address: supplier.address,
            city: supplier.city,
            phone: supplier.contact_phone,
          }
        : null,
      vouchers,
    })
  }

  return {
    id: order.id,
    status: order.status,
    settlementStatus: deriveOrderStatus(lines.map((l) => asSettlementState(l.settlementStatus))),
    createdAt: order.created_at,
    paidAt: order.paid_at,
    subtotalAgorot: Number(order.subtotal_agorot ?? 0),
    totalAgorot: Number(order.total_agorot ?? 0),
    walletAppliedAgorot: Number(order.cashback_applied_agorot ?? 0),
    addressId: order.address_id,
    lines,
  }
}
```

### 20.3 Order detail page

```typescript
// src/app/(account)/account/orders/[id]/page.tsx
import {
  couponStatusLabel,
  couponStatusTone,
  formatDate,
  formatIlsFromAgorot,
  orderStatusLabel,
  orderStatusTone,
} from '@/lib/account/format'
import { getOrderDetail } from '@/server/queries/orders'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'פרטי הזמנה' }

type Props = { params: Promise<{ id: string }> }

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  const order = await getOrderDetail(id)
  if (!order) notFound()

  return (
    <div dir="rtl">
      <h1 className="account-title">הזמנה מתאריך {formatDate(order.createdAt)}</h1>
      <p className="account-subtitle">
        <span className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}>
          {orderStatusLabel(order.settlementStatus)}
        </span>
      </p>

      <section className="account-card">
        <h2 className="account-card__title">סיכום</h2>
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__meta">סכום ביניים</p>
          </div>
          <div className="account-row__actions">{formatIlsFromAgorot(order.subtotalAgorot)}</div>
        </div>
        {order.walletAppliedAgorot > 0 ? (
          <div className="account-row">
            <div className="account-row__main">
              <p className="account-row__meta">שולם מהארנק</p>
            </div>
            <div className="account-row__actions">
              -{formatIlsFromAgorot(order.walletAppliedAgorot)}
            </div>
          </div>
        ) : null}
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__title">סך הכל שולם באתר</p>
          </div>
          <div className="account-row__actions">
            <strong>{formatIlsFromAgorot(order.totalAgorot)}</strong>
          </div>
        </div>
      </section>

      <section className="account-card">
        <h2 className="account-card__title">פריטים</h2>
        {order.lines.map((line) => (
          <div className="account-row" key={line.id}>
            <div className="account-row__main">
              <p className="account-row__title">
                {line.productSlug ? (
                  <Link href={`/product/${line.productSlug}`}>{line.productName}</Link>
                ) : (
                  line.productName
                )}{' '}
                <span className="account-chip">
                  {line.productType === 'coupon' ? 'קופון' : 'פיזי'}
                </span>
              </p>
              <p className="account-row__meta">
                {line.quantity} יחידות · {formatIlsFromAgorot(line.unitPriceAgorot)} ליחידה
                {line.productType === 'coupon' && line.balanceDueAgorot > 0
                  ? ` · ${formatIlsFromAgorot(line.balanceDueAgorot)} לתשלום בבית העסק`
                  : ''}
              </p>
              {line.supplier ? (
                <p className="account-row__meta">
                  {line.supplier.name}
                  {line.supplier.city ? ` · ${line.supplier.city}` : ''}
                  {line.supplier.phone ? ` · ${line.supplier.phone}` : ''}
                </p>
              ) : null}

              {line.vouchers.length > 0 ? (
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  {line.vouchers.map((voucher) => (
                    <div className="coupon-card" key={voucher.code}>
                      {voucher.qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={voucher.qrDataUrl}
                          alt={`קוד QR לקופון ${voucher.code}`}
                          width={120}
                          height={120}
                        />
                      ) : null}
                      <div>
                        <p className="coupon-card__code">{voucher.code}</p>
                        <p className="account-row__meta">
                          <span
                            className={`account-chip account-chip--${couponStatusTone(voucher.status)}`}
                          >
                            {couponStatusLabel(voucher.status)}
                          </span>
                          {voucher.expiresAt ? ` · בתוקף עד ${formatDate(voucher.expiresAt)}` : ''}
                        </p>
                        {voucher.collectAmountAgorot != null && voucher.collectAmountAgorot > 0 ? (
                          <p className="account-row__meta">
                            לתשלום בבית העסק: {formatIlsFromAgorot(voucher.collectAmountAgorot)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="account-row__actions">{formatIlsFromAgorot(line.totalAgorot)}</div>
          </div>
        ))}
      </section>

      <p style={{ marginTop: 16 }}>
        <Link className="account-btn" href="/account/orders">
          חזרה להזמנות
        </Link>
      </p>
    </div>
  )
}
```

---

## 21. Loading + empty shells (RTL)

```typescript
// src/app/(account)/account/loading.tsx
export default function AccountLoading() {
  return (
    <div className="account-loading" dir="rtl" aria-busy="true" aria-label="טוען">
      <div className="account-skeleton account-skeleton--title" />
      <div className="account-skeleton account-skeleton--card" />
      <div className="account-skeleton account-skeleton--card" />
    </div>
  )
}
```

```typescript
// src/app/(account)/account/orders/loading.tsx
export default function OrdersLoading() {
  return (
    <div dir="rtl" aria-busy="true" aria-label="טוען הזמנות">
      <div className="account-skeleton account-skeleton--title" />
      <div className="account-skeleton account-skeleton--row" />
      <div className="account-skeleton account-skeleton--row" />
      <div className="account-skeleton account-skeleton--row" />
    </div>
  )
}
```

---

## 22. RTL / a11y checklist (account)

- Root account shell: Hebrew copy only in customer UI.
- Forms: `dir="rtl"`, labels associated with `htmlFor`.
- Alerts: `role="alert"` on errors.
- Chips: status via text, not color alone.
- QR images: meaningful `alt` including code.
- Logout buttons: real `<form action={serverAction}>`, not client-only fetch.
- Focus order mirrors visual RTL order.

---

## 23. Acceptance (expanded)

- [ ] Unauthenticated `/account` → Google login with `next`
- [ ] Dashboard: wallet, last order, coupons, order count
- [ ] Orders list + detail with QR for issued vouchers
- [ ] Coupons tabs + status labels issued/used/expired
- [ ] Addresses CRUD soft-delete + single default
- [ ] Tokens: last4 only, default, delete
- [ ] Details: name/phone edit, email read-only
- [ ] Logout local + optional global → `/login`
- [ ] Every listed query respects RLS / user_id
- [ ] RTL throughout

---

## 24. File map (complete)

```
src/app/(account)/layout.tsx
src/app/(account)/account/page.tsx
src/app/(account)/account/loading.tsx
src/app/(account)/account/details/page.tsx
src/app/(account)/account/orders/page.tsx
src/app/(account)/account/orders/loading.tsx
src/app/(account)/account/orders/[id]/page.tsx
src/app/(account)/account/coupons/page.tsx
src/app/(account)/account/addresses/page.tsx
src/app/(account)/account/tokens/page.tsx
src/app/(account)/account/wallet/page.tsx
src/app/(auth)/login/page.tsx
src/app/(auth)/login/LoginForm.tsx
src/app/auth/callback/route.ts
src/components/account/AccountNav.tsx
src/components/account/ProfileDetailsForm.tsx
src/components/account/LogoutButtons.tsx
src/components/account/AddressManager.tsx
src/components/account/TokenManager.tsx
src/components/account/CouponQr.tsx
src/server/actions/auth.ts
src/server/actions/account.ts
src/server/queries/account.ts
src/server/queries/orders.ts
src/lib/validations/account.ts
src/lib/account/format.ts
src/lib/account/types.ts
src/styles/account.css
```

---

END OF BINDING SPEC
