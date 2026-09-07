# Runbook: rollback

## App deploy

Vercel: promote previous deployment. `NEXT_PUBLIC_*` is baked: old deploy has old public env.

## Feature / kill switch

Set kill switch env; wait for new instances. Checkout: `CHECKOUT_ENABLED` not true.

## Migration

Forward-only. ROLLBACK header in each pending file. Never `db push`. Partition 148: do not reverse casually. Enum members (135 recurring): cannot drop.

## Failed finalize after charge

Do not roll back the deploy to "unpay". Run stranded cron. Rollback will not uncharge Cardcom.

## Git

Do not force-push `main`. Do not checkout `closeout/v1-final` from this worktree to "fix" prod.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
