# ARCHITECTURE-OBSERVABILITY.md

ארכיטקטורת **Observability** (logs, metrics, traces, alerts).

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.

## Pillars
| Pillar | Choice |
|---|---|
| Errors | Sentry (Next + Edge) |
| Logs | Vercel/runtime logs + structured JSON on money paths |
| Uptime | External ping on `/` + checkout health |
| Alerts | Ntfy (SEV1/2) for DLQ, payment spike, zero-purchase anomaly |
| Product analytics | Separate (`ARCHITECTURE-ANALYTICS-KPI.md`); not a substitute for ops |

## Money path telemetry (required)
Emit structured events (no PII/PAN):

- `checkout_started`, `payment_redirected`, `webhook_received`, `finalize_ok|fail`, `voucher_issued`, `redeem_ok|fail`

Correlate with `order_id` / `payment_id`.

## SLOs (targets)
| Service | SLO |
|---|---|
| Storefront availability | 99.5% monthly |
| finalize success after paid webhook | ≥ 99.9% (excl. provider downtime) |
| redeem API p95 | < 500ms |

## Alert examples
| Condition | SEV |
|---|---|
| Webhook fail rate > 5% / 5m | SEV1 |
| Notification DLQ growth | SEV2 |
| Cardcom timeout spike | SEV1 |
| RLS/auth error storm | SEV2 |

## Rules
No secrets in Sentry breadcrumbs. No Make/Zapier alert routing as primary.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Observability binding in `ke-arch` (`arch/docs-queue`) |
