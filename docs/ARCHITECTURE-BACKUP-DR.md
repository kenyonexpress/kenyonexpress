# ARCHITECTURE-BACKUP-DR.md

ארכיטקטורת **גיבוי ו-Disaster Recovery**.

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.

## Objectives
| Item | Target |
|---|---|
| RPO (DB) | ≤ 1 hour (PITR) |
| RTO (storefront read) | ≤ 4 hours |
| RTO (checkout money) | ≤ 8 hours with Cardcom verify |

## Backups
1. Supabase PITR enabled on prod.  
2. Weekly logical dump encrypted offsite (optional belt).  
3. Vercel deploy rollback always available.  
4. Secrets in vault/dashboard only (never git).

## Critical data classes
| Class | Examples | Restore priority |
|---|---|---|
| Money | orders, order_items, payments, vouchers, wallet, ledger | P0 |
| Identity | profiles, auth | P0 |
| Catalog | products, media refs | P1 |
| Analytics | events | P2 |

## Drills
- Quarterly restore drill to staging.  
- Documented runbook: who, which project ref, verify row counts + sample order.

## Incident: ransomware / bad migration
1. Disable checkout kill switch.  
2. Restore PITR to timestamp before damage.  
3. Replay Cardcom unsettled via GetLpResult reconcile.  
4. Do not re-run destructive down-migrations blindly.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Backup/DR binding in `ke-arch` (`arch/docs-queue`) |
