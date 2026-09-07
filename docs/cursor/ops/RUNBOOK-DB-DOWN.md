# Runbook: database down

1. `/api/ready` vs `/api/health` (process up, deps down).
2. Supabase status page. Do not `db push`.
3. Checkout will fail closed (cannot reserve stock). Kill checkout if errors are partial writes.
4. PITR: human dashboard only. Restore is orders+payments+vouchers+wallet together.
5. Do not point `DATABASE_URL` at Vercel for the app (tooling only).
