# Wave index (canonical queue of 100)

Branch `ke-cursor-docs`. Canonical wave files are **this** numbering. Leftover files from an earlier naming pass (`W06-NEWSLETTER.md`, `W10-ANALYTICS.md`, `W16-ACCOUNT.md`, …) are extra briefs; if they disagree, **this index and the matching Wxx filename in the 100-item prompt win**.

Target tag after W49: `v7.0.0-rc1`.

---

## Waves

| Wave | File | Depends on | On critical path to v7? |
|---|---|---|---|
| W03 | `W03-REVIEWS.md` | H6 paid orders | No |
| W04 | `W04-WISHLIST.md` | Cart merge | No |
| W05 | `W05-ABANDONED-CART.md` | W17 email, W64 consent, H1 | No |
| W06 | `W06-WHATSAPP.md` | H4 number | No (H4 is) |
| W07 | `W07-SUPPLIER-ONBOARDING.md` | W35, W38 | No |
| W08 | `W08-CONTENT-UPLOADER.md` | W15 | Soft yes (staff safety) |
| W09 | `W09-ANALYTICS.md` | Human 169 | No |
| W10 | `W10-I18N.md` | Stable HE copy | No |
| W11 | `W11-HARDENING.md` | Secret rotation | **Yes** |
| W12 | `W12-RESILIENCE.md` | W11 | **Yes** |
| W13 | `W13-DATA-INTEGRITY.md` | Probes | **Yes** |
| W14 | `W14-BACKUP.md` | Human PITR | Soft yes |
| W15 | `W15-ADMIN-OPS.md` | W08, W25 stub | Soft yes |
| W16 | `W16-CUSTOMER-ACCOUNT.md` | Auth | **Yes** |
| W17 | `W17-EMAIL.md` | H1 Resend | **Yes** (voucher mail) |
| W18 | `W18-MOBILE.md` | W35 | Till yes |
| W19 | `W19-STATES.md` | Guards live | **Yes** |
| W20 | `W20-PERF-BUDGET.md` | Visual gate | Soft yes |
| W21 | `W21-SEARCH-READINESS.md` | None | No |
| W22 | `W22-CATEGORIES.md` | 171 optional | No |
| W23 | `W23-PROMOTIONS.md` | Discount engine | No |
| W24 | `W24-INVENTORY.md` | Human 172 | **Yes** (master SKU) |
| W25 | `W25-PAYOUTS.md` | Coupon 100/0 | **Yes** (do not fake payouts) |
| W26 | `W26-LEGAL.md` | Counsel | **Yes** (no escrow copy) |
| W27 | `W27-SEO.md` | Feeds | Soft |
| W28 | `W28-MONITORING.md` | ntfy topic | **Yes** |
| W29 | `W29-GIFT-VOUCHERS.md` | Finalize | No |
| W30 | `W30-MULTI-VOUCHER.md` | Issuer already | Document yes |
| W31 | `W31-PARTIAL-REDEMPTION.md` | W30 | No (forbid balance QR) |
| W32 | `W32-TRANSFER.md` | Skip | No |
| W33 | `W33-EXPIRY.md` | Cron | **Yes** |
| W34 | `W34-MULTI-LOCATION.md` | 133 | No |
| W35 | `W35-STAFF-ROLES.md` | Members | **Yes** |
| W36 | `W36-SUPPLIER-NOTIFICATIONS.md` | W17 | Soft |
| W37 | `W37-SUPPLIER-ANALYTICS.md` | W35 | No |
| W38 | `W38-CONTRACT-TERMS.md` | W07, W25 | Soft |
| W39 | `W39-LOYALTY.md` | Finalize cashback | Document yes |
| W40 | `W40-TIERS-SEGMENTS.md` | Skip | No |
| W41 | `W41-PWA.md` | Cache policy | Soft |
| W42 | `W42-PUSH-CAMERA-WALLET.md` | W18 | Soft |
| W43 | `W43-FRAUD.md` | Referrals SQL | **Yes** |
| W44 | `W44-ADMIN-PLATFORM.md` | W15 | Soft |
| W45 | `W45-DESIGN-ENFORCEMENT.md` | Gates | Soft |
| W46 | `W46-LOAD-TUNING.md` | Indexes | No |
| W47 | `W47-TEST-DEPTH.md` | Code branch | Soft |
| W48 | `W48-RULE-VERIFICATION.md` | This pack | Soft |
| W49 | `W49-LAUNCH.md` | H0–H8 humans | **Yes (the cutover)** |
| W50 | `W50-MAINTENANCE.md` | After v7 | After |

---

## Critical path to `v7.0.0-rc1`

```
W11 hardening (key rotation)
  → W12 resilience / W13 integrity / W19 states
  → W24 inventory 172 + app guard
  → W16 account + W17 email drain + W33 expiry cron
  → W25 payout stub (no fake schema) + W26 legal copy
  → W28 monitoring ntfy
  → W35 membership till + W18 mobile (no service_role)
  → W43 fraud stays in SQL
  → W49 launch (DNS last)
```

Skip on purpose for v7: W10, W32, W40, W03 as a marketed feature, W07 self-serve, WhatsApp campaigns.

---

## Also in this 100

`docs/cursor/contracts/` items 50–64, `ops/` 65–79, `quality/` 80–87, `business/` 88–95, meta 96–100.
