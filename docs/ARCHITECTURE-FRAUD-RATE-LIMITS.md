# ARCHITECTURE-FRAUD-RATE-LIMITS.md

ארכיטקטורת **הגבלת קצב ונוגד הונאה** (שכבת מוצר).

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.

## Rate limits (examples)
| Action | Limit |
|---|---|
| begin_checkout / user | 10 / min |
| login / IP | existing auth limits |
| redeem / supplier | tight per code + per member |
| search / IP | burst protect |
| agent tools / user | low RPM |

Implementation: `check_user_rate_limit` / Upstash / edge.

## Fraud signals
- Velocity: many cards / many fails per user  
- Self-referral loops  
- Redeem from impossible geo vs supplier (soft flag)  
- Webhook signature failures  

## Responses
1. Soft challenge / delay.  
2. Block checkout flag on profile.  
3. Admin review queue.  
Never auto-email PAN or tokens.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Fraud/rate-limit binding in `ke-arch` (`arch/docs-queue`) |
