# ARCHITECTURE-ACCOUNT-AREA.md

ארכיטקטורת **אזור אישי** (`/account/**`).

Status: BINDING summary in `ke-arch` · Date: 2026-07-31 · docs only.  
Companion: `ke-arch-account-area` full doc.

## Auth
Google OAuth בלבד לכניסה לאזור. Layout `getUser()` gate. Logout → `/login`.

## Routes
| Route | Job |
|---|---|
| `/account` | סקירה |
| `/account/coupons` | פעיל / נסרק / פג + **QR** |
| `/account/orders` (+ `[id]`) | היסטוריה |
| `/account/details` | שם/טלפון + התנתקות |
| `/account/tokens` | last4 בלבד; set default / delete |
| `/account/wallet` | יתרה + תנועות; שימוש בקופה בלבד |
| `/account/addresses` | soft-delete |

## Money / vouchers
Canonical table `vouchers`. Wallet internal only (no cash-out). No PAN. No Escrow copy.

## RLS (must)
Owner SELECT on profiles, orders, vouchers, wallet_accounts/entries, payment_tokens (without `cardcom_token`), user_addresses. No customer writes to wallet ledger.

## UI
RTL, Heebo, container ~1320px, `#fed700`, tokens from `account.css` / `refs/`.

## Gaps vs live (track)
Coupons page needs tabs + QR; nav logout; Google-only login UX.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Account-area binding summary in `ke-arch` (`arch/docs-queue`) |
