# W30 WhatsApp campaigns (marketing)

Code-agent spec. POST-LAUNCH P4. Older marketing doc preferred **Meta Cloud API direct**, not Twilio, for a young catalogue. Twilio is a vendor overlay; Meta still approves templates.

---

## What the wave builds

1. Marketing templates: abandoned cart (if product reverses unique-one-nudge), win-back. Explicit opt-in. Stop text.
2. Webhook delivery status → suppression.
3. Do not send into the float fallback number.

**Do not build** until W06 consent and H4 number and W45 kind expansion are real. Abandoned cart unique `cart_id` still means at most one email; a WhatsApp second touch is a **product reversal**, not a bugfix.

---

## Tables

Outbox + consent flags + suppressions. No blast table that bypasses the outbox.

---

## RLS

Admin enqueue only via DEFINER. Anon never INSERT.

---

## Money invariants

Campaign copy must not promise a price. Deep link to PDP/cart and re-price.

---

## Tests

No send without marketing WhatsApp opt-in. Suppression honoured. Kind in CHECK. Rate / frequency cap (see OUTBOX-CONTRACT).

---

## Feature flag

Off by default. Off: drain skips WhatsApp marketing kinds, transactional W29 still flows.

---

## Close

Legal opt-in. One vendor path. Frequency cap. No escrow/10% story in templates.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
