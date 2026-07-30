# ARCHITECTURE-REFERRALS.md

ארכיטקטורת **הפניות / שותפים** (referrals & affiliates).

Status: BINDING lite · `ke-arch` · Date: 2026-07-31 · docs only.  
Schema sketch exists in early migrations (`010_referrals_*`); activate only with clear fraud rules.

## Concepts
| Role | Earns when |
|---|---|
| Referrer (customer) | Invitee first paid order (optional wallet credit) |
| Affiliate | Tracked `?ref=` order; payout separately from coupon prepaid |

## Rules
1. Attribution window documented (e.g. 30 days last-click).  
2. Credit is **wallet or affiliate balance**, never card cash-out by default.  
3. Self-referral blocked.  
4. Coupon money model unchanged: platform keeps prepaid.  
5. Admin can claw back on fraud/refund.

## Surfaces
Share link in account · admin affiliates table · KPI: referred GMV.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Referrals lite in `ke-arch` (`arch/docs-queue`) |
