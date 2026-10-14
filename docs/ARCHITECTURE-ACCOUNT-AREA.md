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

**Loading (UX27, 15.10).** `src/app/(account)/account/loading.tsx` renders
`AccountContentSkeleton` (the title line box, the subtitle, three `.account-card`
frames with bars; `aria-busy`, one `sr-only` sentence) and is the ONE Suspense
boundary over the content column: the instant state Next paints on a client-side
navigation into any /account page, and what the server's first flush carries on
a direct load. Measured before (`logs/ux27/before.json`): a tab press held the
previous page for 2289 / 2530 / 2609ms at 380 / 768 / 1440, and a direct load of
/account/orders flushed an empty column at 313ms with the page at 2326ms.
After: the skeleton at 19ms on the press, and in the shell flush on a direct
load. The layout carries no `<Suspense>` of its own round `{children}`: with
both, the outer boundary completes during the prerender and Fizz writes its
nonce-less reveal runtime into 23 account shells, which the csp gate refuses
(`logs/ux27/build.log`). orders/[id] and return/[orderId] already streamed
under the old layout boundary, so an unknown id was already a streamed
not-found; the status code is unchanged.

## Gaps vs live (track)
Coupons page needs tabs + QR; nav logout; Google-only login UX.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Account-area binding summary in `ke-arch` (`arch/docs-queue`) |
