# Runbook: database down

Likelihood: low (Supabase managed). Impact: total. Checkout, scan, wallet, admin all fail.

## First ten minutes

1. Hit `/api/ready` vs `/api/health`. Process up + deps down means Postgres/auth, not Next.
2. Supabase status for project `ixvwfbuvfxxsjiywhbbb`. Do not `db push`. Do not apply pending SQL to "fix" a regional outage.
3. If errors are partial writes (timeout after INSERT), set `CHECKOUT_ENABLED` off. Stock reservations without paid orders strand inventory.
4. ntfy: stranded-payments and cron-health will fire. Treat as symptoms, not a second outage.
5. Do not point `DATABASE_URL` at Vercel Postgres for the app. That URL is tooling only.

## Recovery

- Wait for Supabase. PITR restore is a **human** dashboard action. Restore orders + payments + vouchers + wallet together. Restoring catalogue alone leaves charged-not-issued.
- After restore: run stranded-payments cron, then reconcile cron. Do not INSERT fake `payment_events`.
- Re-measure RLS only if someone "fixed" policies during the outage.

## Do not

Apply 169–172 by number. Forward guest Cookie jar. Mock Cardcom. Open a replica for writes.

---

## Second pass

Restore is orders + payments + vouchers + wallet together. No `db push`. After PITR run stranded then reconcile. Never INSERT fake `payment_events`.
