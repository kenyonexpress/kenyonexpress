# W06 WhatsApp

Code-agent spec. Click-to-chat exists (`src/lib/whatsapp.ts`, float, PDP share). `sendOutboxWhatsapp` already runs as a drain leg. Campaigns are **not** this wave (see also W30 leftover spec). Utility first.

---

## What it builds

1. Production `NEXT_PUBLIC_WHATSAPP_PHONE` is the real business number (H4). Never `972524635550`.
2. Click-to-chat only on products with `whatsapp_enabled` **and** a valid number.
3. Analytics `whatsapp_click` (client event; needs ingest 151 live).
4. Transactional WhatsApp only if Meta template is approved: voucher issued / expiry. Marketing is a later flag.

---

## Tables

`products.whatsapp_enabled`, `notification_outbox` (existing kinds only), `suppliers` phone fields. No new table.

---

## RLS

Public read of enabled flag on active products. Outbox INSERT service_role / DEFINER only.

---

## Money invariants

Chat is off-platform. A WhatsApp quoted price is not a charge. Checkout still re-prices. Payload amounts in utility templates are snapshotted `*_agorot` formatted with `formatIls`.

---

## Tests before close

Float hidden when env unset. `whatsapp_click` schema. No send to test-store number. Outbox kind CHECK unchanged unless W17/OUTBOX expands it. `KILL_SWITCH_NOTIFICATIONS` skips the WhatsApp leg.

---

## Feature flag

`whatsapp_enabled` per product (default false as measured 2026-09-02). Env number. Kill switch notifications.

---

## Docs updated

`LAUNCH-BLOCKERS.md` H4, `OUTBOX` contract, `POST-LAUNCH-ROADMAP.md` P4, `GLOSSARY.md`.

---

## Edge cases

- Meta template language is Hebrew; English `/en` must not send HE templates as "done" (W10).
- Three senders (float, Twilio, Meta direct) is forbidden. Pick one campaign vendor later.
- Consent: click-to-chat is not marketing opt-in.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Float label | וואטסאפ |
| PDP | דברו איתנו בוואטסאפ |
| Share | שיתוף בוואטסאפ |
| Unconfigured | (button omitted, not an error toast) |

---

## Open questions

| Q | Best answer |
|---|---|
| Twilio or Meta direct? | **Meta direct** for a young catalogue (no BSP fee). Twilio does not skip Meta approval. |
| Enable all products? | **No.** Per-product flag. H4 number first. |

---

## Second pass (after contracts)

- Click-to-chat is not WhatsApp marketing opt-in (`contracts/CONSENT-MODEL.md`).
- Utility templates only for kinds already in CHECK. Adding `voucher_expiring` already exists; do not invent `whatsapp_campaign` here (`contracts/OUTBOX.md`).
- Twilio down: click-to-chat still works. `ops/RUNBOOK-TWILIO-DOWN.md` is mostly no-op if Meta is unused.
- Amounts in templates: snapshot `*_agorot`, format with `formatIls`. Never let Meta round (`contracts/LEDGER.md`).
- `profiles.role = vendor` does not enable the float. Product `whatsapp_enabled` plus env number.
