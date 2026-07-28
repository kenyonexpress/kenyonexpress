# ARCHITECTURE-COUPON-REDEMPTION.md

KenyonExpress coupon QR / code redemption architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No application code in this change.
Companions: `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`.

Canonical money-mutating path: `public.redeem_voucher` (migrations 073/074; audit form in 085 when applied).
HTTP: `POST /api/supplier/vouchers/redeem` (user JWT; alias `POST /api/supplier/redeem` acceptable).
**Supplier scan is mobile web / PWA. No native app required.**

---

## 0. Business model (redemption economics)

| Fact | Rule |
|---|---|
| Platform identity | KenyonExpress is a **platform**, never a supplier. It does not redeem as a merchant. |
| Online payment | Customer already paid full **`coupon_price_ils`** on site (absolute, admin-set, **no default**) |
| At scan | Customer pays **remainder** `face - coupon_price` **directly to the supplier** (cash/card at till). Platform does not collect it |
| After scan | Coupon / voucher **expires** (terminal `redeemed`). Single-use forever |
| `platform_percent` | Dynamic per product, **admin-only**, no fixed rate, no DB default; snapshotted at purchase onto `order_items` / voucher. Governs platform share of **on-site prepaid**, not the till remainder. Common config 100/0 (platform keeps all prepaid) |
| Physical contrast | Physical orders split immediately by snapshotted `platform_percent`; redeem path is coupon-only |
| Escrow | **None** |
| PDP | Every product page shows supplier details; voucher UX names that supplier |

Success UI must highlight **יתרה לגבייה בבית העסק** (`remaining_amount_due_agorot`). Never promise a platform bank transfer for that till amount. Payout generators **must not** create coupon payout lines.

Money: integer **agorot** internally; UI shows ILS with 2 decimals.

---

## 1. Token generation (single-use, signed)

Issued in the same transactional finalize path as `orders.status = paid` (Cardcom verified). One voucher row per purchased coupon unit.

### 1.1 Artifacts

| Field | Purpose |
|---|---|
| `code` | Human / manual entry; constrained alphabet (e.g. Crockford-ish 10 chars); UNIQUE |
| `qr_payload` | Signed string rendered as QR |
| `qr_key_id` | Key version for rotation |
| Money snapshots | `face_value_agorot`, `coupon_price_agorot`, `remaining_amount_due_agorot`, `platform_percent` |
| Links | `order_id`, `order_item_id`, `product_id`, `supplier_id`, `user_id` |
| `status` | starts `issued` |
| `expires_at` | calendar expiry (separate from scan-expiry) |

Conservation CHECK: `face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot`.

### 1.2 QR format (signed)

```
KEV1.<base64url payload>.<base64url signature>
```

- Payload: at least `code` (optional opaque ids). **Never trust `supplier_id` from QR for authorization.**
- Signature: keyed **HMAC-SHA256** (online) and/or **Ed25519** (offline verify). Unkeyed digests are forbidden.
- HMAC proves minting only. **Single-use is decided solely by conditional SQL UPDATE**, not by the signature alone.
- Secrets live in vault / env (`VOUCHER_QR_HMAC_SECRET`, optional Ed25519 private). Rotate via `qr_key_id`.

### 1.3 Issue rules

1. Only after Cardcom-verified paid finalize (idempotent).
2. Never re-issue a new code for an already `issued` line without cancelling the old one.
3. Snapshot supplier identity + money from `order_items` (immutable).
4. Customer notification may include deep link; treat token as secret (**Q-REDEEM-MAIL**: prefer account link over raw token in email when possible).

---

## 2. Customer-side QR rendering

| Surface | Behavior |
|---|---|
| `/account/vouchers` | List own vouchers (RLS `user_id = auth.uid()`); show QR image from `qr_payload` + printable `code` |
| Order detail | Same for paid coupon lines |
| Optional `/redeem/[token]` | Deep link for display; **`noindex`**; disallow in robots; never in sitemap |

Rendering:

- Client or server generates QR bitmap from `qr_payload` (library of choice; no third-party upload of the payload).
- Show Hebrew status: תקף / מומש / פג תוקף / בוטל.
- Show supplier name/phone from snapshot (matches PDP disclosure).
- Show till amount as the amount the merchant will collect.

Touch targets on account actions ≥ 44px (visual goal). RTL Hebrew UI.

---

## 3. Supplier scan flow (mobile web, no app)

Route: `/supplier/scan` (PWA-capable). Auth: active `supplier_members` with role `scanner` or higher. Suspended supplier / inactive membership → cannot redeem.

### 3.1 Happy path

1. Open scan page (camera permission) or switch to **manual code** entry.
2. Decode QR → extract `code`; optional client HMAC verify (fail → do not call redeem; log `invalid_signature`).
3. Generate `idempotency_key = crypto.randomUUID()` once per tap (persist for offline queue).
4. `POST /api/supplier/vouchers/redeem` with user JWT:

```json
{
  "code": "AB12CD34EF",
  "scan_method": "camera",
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

`scan_method`: `camera` | `manual` | `offline_sync`.

5. Handler: session required; Zod body; optional edge rate-limit; call `redeem_voucher` with **user JWT** (never service role for membership checks).
6. On success: show product name, face, **till amount**, supplier; clear scanner for next code.
7. Emit notification facts per `ARCHITECTURE-NOTIFICATIONS.md` (`coupon_redeemed` / `coupon_expired_after_scan`).

### 3.2 Manual offline-friendly entry

Same RPC. Normalize code: trim, uppercase, strip separators. Works without camera (poor connectivity / broken camera).

---

## 4. Validation endpoint state machine

### 4.1 Voucher lifecycle

```
issued ---> redeemed     (scan success; terminal; "expires after QR scan")
issued ---> expired      (calendar sweep; terminal)
issued ---> cancelled    (order cancel before redeem; terminal)
issued ---> refunded     (refund path; terminal)
```

Conceptual labels requested by product:

| Label | DB reality |
|---|---|
| **valid** | `status = issued` AND `expires_at > now()` |
| **scanned** | `status = redeemed` (scan-expired; single-use done) |
| **expired** | `status = expired` (calendar) or treat redeemed as expired-for-reuse |

There is no separate `scanned` enum value: **scanned = redeemed**.

### 4.2 RPC steps (`redeem_voucher`)

1. `auth.uid()` required else `unauthorized`.
2. Active membership required else audit `unauthorized`.
3. Idempotency: same key + same code → replay prior outcome; same key + different code → `invalid_request`.
4. Rate limit: `check_user_rate_limit(uid, 'voucher_scan', 30, 60)` → `rate_limited`.
5. **Atomic single-use:**

```sql
UPDATE public.vouchers v
SET status = 'redeemed',
    redeemed_at = now(),
    redeemed_by_user_id = auth.uid(),
    redeemed_by_supplier_id = <membership supplier matching v.supplier_id>,
    redeemed_amount_collected_agorot = v.remaining_amount_due_agorot,
    updated_at = now()
WHERE v.code = normalized_code
  AND v.status = 'issued'
  AND v.expires_at > now()
  AND v.supplier_id IN (
    SELECT supplier_id FROM public.supplier_members
    WHERE user_id = auth.uid() AND is_active
  )
RETURNING *;
```

6. If row updated → insert `voucher_redemptions` (`outcome = success`), return success payload highlighting `remaining_amount_due_agorot`.
7. Else probe and classify: `already_redeemed`, `expired`, `cancelled`, `refunded`, `not_found`. Store honest `wrong_supplier` in audit; **collapse to `not_found` in API JSON** (anti-enumeration).

### 4.3 Outcome → HTTP map

| Internal outcome | HTTP | Meaning |
|---|---|---|
| `success` (+ `replayed`) | 200 | UPDATE matched or idempotent replay |
| `unauthorized` | 401 | no session / no membership |
| `invalid_request` | 400 | bad body / idempotency mismatch / HMAC fail |
| `rate_limited` | 429 | scan rate limit |
| `already_redeemed` | 409 | already terminal redeemed |
| `expired` | 410 | calendar expiry |
| `cancelled` / `refunded` | 409 | order paths |
| `wrong_supplier` | audit only; API **`not_found`** | anti-enumeration |
| `not_found` | 404 | unknown code |

No authenticated `UPDATE` / `INSERT` policies on `vouchers` or `voucher_redemptions`. RPC only.

---

## 5. Race conditions and double-scan prevention

1. **Conditional UPDATE** with `status = 'issued'` predicate: exactly one concurrent transaction wins.
2. Loser gets `ROW_COUNT = 0` → classify `already_redeemed` (or other probe).
3. Partial unique index: one success row per voucher in `voucher_redemptions` (`outcome = 'success'`).
4. **Idempotency key:** same key + same code → safe replay with `replayed: true`.
5. Double-tap / two devices / offline drain of the same intent: same idempotency key → one logical redeem.
6. Never trust client-reported `already_redeemed` without server classification.

---

## 6. Offline fallback

1. If network lost after local verify (or manual entry): store intent in IndexedDB `{ code, scan_method: 'offline_sync', idempotency_key, created_at }`.
2. Service worker / foreground drain POSTs each intent when online through the **same** Route Handler.
3. Server idempotency guarantees one success.
4. UI marks `synced` | `failed` | `already_redeemed` so the till operator sees the truth.
5. Optional Ed25519 client verify for forged-QR rejection while offline (**Q-REDEEM-1**); still must hit server before treating as redeemed for money/till confirmation.

Manual code entry remains available online without camera at all times.

---

## 7. Audit trail (`redemption_events`)

### 7.1 Existing: `voucher_redemptions`

Every attempt (success or fail) inserts: `voucher_id`, `code_entered`, `supplier_id`, `scanned_by`, `scan_method`, `outcome`, `idempotency_key`, `amount_collected_agorot`, `metadata`, optional `ip_address` / `user_agent` (085).

### 7.2 Binding name: `redemption_events`

Product/ops language uses `redemption_events`. Implementation choice:

| Option | What |
|---|---|
| **A (default)** | View `public.v_redemption_events` over `voucher_redemptions` + voucher/product joins |
| **B** | Physical table `public.redemption_events` append-only mirror for warehouse |

Default: **A** unless BI requires B (**Q-REDEEM-2**).

If B is chosen, columns at minimum:

- `id`, `created_at`
- `voucher_id`, `code_entered`, `supplier_id`, `scanned_by`
- `scan_method`, `outcome`, `idempotency_key`
- `amount_collected_agorot`, `ip_address`, `user_agent`, `metadata`
- no UPDATE/DELETE for authenticated; service/admin read

Admin UI: redemption timeline, fraud filters (§8). RLS: admin/service; supplier may read own success rows via existing redemption policies.

---

## 8. Fraud signals

| Signal | Detection | Response |
|---|---|---|
| Double scan | conditional UPDATE + unique success | second → `already_redeemed` |
| Cross-shop probe | membership ∩ `supplier_id` fail | audit `wrong_supplier`; API `not_found` |
| Brute force | rate limit 30/min/user | `rate_limited` + ntfy on burst |
| Forged QR | HMAC/Ed25519 fail | no redeem; audit invalid |
| Cancelled/refunded reuse | status predicates | 409 typed |
| Multi-IP same code | `ip_address` on redemptions | admin investigate |
| Replay storm | idempotency keys | safe replay |
| Suspended supplier | membership / status check | unauthorized |

Ntfy admin alerts for rate-limit bursts and DLQ patterns per `ARCHITECTURE-NOTIFICATIONS.md`.

---

## 9. Migrations (077+, MCP `apply_migration` only)

**Never** `supabase db push`. Apply only via Supabase MCP `apply_migration`.

Ordinals **077+** are already used on some hosts (supplier order read). Use the **next free** number from hosted `schema_migrations` (**Q-REDEEM-MIG**).

| Proposed content | Notes |
|---|---|
| Ensure vouchers CHECKs + `redeem_voucher` (073/074/085) | apply gaps only |
| `voucher_redemptions` ip/ua if missing | 085 |
| `v_redemption_events` view **or** `redemption_events` table | this doc §7 |
| Unique success partial index if missing | race belt |
| Comments documenting scan-expiry semantics | no money model change |

Idempotent `IF NOT EXISTS` / `CREATE OR REPLACE` everywhere. No Escrow tables. No coupon payout line generators.

---

## 10. Acceptance checklist

- [ ] Double-scan → one `redeemed` + one `already_redeemed`
- [ ] Wrong shop → external `not_found`; audit stores `wrong_supplier`
- [ ] Success UI shows till amount; no platform transfer copy for coupon remainder
- [ ] Offline drain idempotent with stable `idempotency_key`
- [ ] Manual entry works without camera
- [ ] No authenticated UPDATE policy on `vouchers`
- [ ] `/redeem/` noindex and out of sitemap
- [ ] Notifications emit redeem / scan-expiry facts without leaking full codes in public channels
- [ ] `platform_percent` on voucher is snapshot only; till remainder never paid by platform

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-REDEEM-MIG | First free migration ordinal on prod |
| Q-REDEEM-1 | Ed25519 vs HMAC-only for v1 offline verify |
| Q-REDEEM-2 | Separate `redemption_events` table vs view |
| Q-REDEEM-3 | Email supplier on every redeem (default off) |
| Q-REDEEM-MAIL | Raw token in email vs account deep link only |

---

## 12. Related

| Symbol | Role |
|---|---|
| `redeem_voucher` | SECURITY DEFINER RPC |
| `/supplier/scan` | PWA scanner UI |
| `/api/supplier/vouchers/redeem` | HTTP transport |
| `vouchers`, `voucher_redemptions` | state + audit |
| `v_redemption_events` / `redemption_events` | ops name |
| `supplier_members` | authorization |
| `coupon_redeemed`, `coupon_expired_after_scan` | notification events |
