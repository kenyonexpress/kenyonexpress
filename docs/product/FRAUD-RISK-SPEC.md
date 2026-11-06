# Fraud and risk spec

Status: DRAFT · docs only  
Companions: `docs/ARCHITECTURE-SECURITY.md`, `docs/ARCHITECTURE-FRAUD-RATE-LIMITS.md`, `docs/ARCHITECTURE-AI-AGENTS.md`, `docs/CUSTOMER-SUPPORT-PLAYBOOK.md`, `src/lib/rate-limit/policies.ts`

Agents never auto-freeze money. Humans decide. PAN never in tickets. Identifiers: email, order id, 10-char voucher code.

Live limiter: `checkRateLimit` (Upstash then Postgres). **Both down → fail-open** in app code. Money docs want fail-closed on checkout and redeem. This spec: **fail-closed on Pay, redeem, and refund**; fail-open may remain on search/analytics. Until code matches, ops treats an open limiter as SEV2 during a campaign.

---

## 1. Velocity rules

Live numbers from `RATE_LIMIT_POLICIES` plus DB redeem:

| Policy | Limit | Window | Key | Path |
|---|---:|---:|---|---|
| `begin_checkout` | 10 | 60s | `user:<id>` | checkout |
| `cart_write` | 120 | 3600s | user or IP | cart |
| `redeem` (customer page) | 60 | 3600s | IP | public redeem page |
| `voucher-redeem` | 120 | 3600s | supplier user | `/scan` |
| `voucher-redeem-batch` | 40 | 3600s | supplier user | batch |
| `voucher-lookup` | 300 | 3600s | supplier user | lookup |
| `voucher_scan` (DB) | 30 | 60s | supplier uid | inside redeem RPC |
| `login` | 10 | 3600s | IP | auth |
| `login-account` | 20 | 3600s | email | auth |
| `phone-otp` / `phone-otp-number` | 5 | 3600s | IP / E.164 | SMS |
| `signup` / `magic` / `reset` | 5 | 3600s | IP or address | auth |
| `search` | 120 | 300s | IP | search |
| `search-suggest` | 300 | 300s | IP | suggest |
| `analytics` | 120 | 60s | IP | events |
| `contact` / `supplier-lead` / `newsletter` | 5 | 3600s | IP | forms |
| `referral-code` | 10 | 3600s | user | referrals |

Agent detectors (queue `agent_flags`, no auto block):

| kind | Threshold |
|---|---|
| `scan_velocity` | >30 scans/hour/scanner or 5× that supplier's daily average |
| `wrong_supplier_burst` | 5+ wrong_supplier / 24h / scanner |
| `refund_abuse` | 3+ refund requests / user / 30 days |
| `cashback_velocity` | >20000 agorot cashback earn+spend / 48h |
| `wallet_multi_account` | 3+ accounts same phone/address taking referral or cashback |
| `double_redemption` | ledger vs scan mismatch |
| `commission_anomaly` | affiliate/platform math off vs snapshot |

Hebrew customer copy when limited on Pay:

```
יותר מדי ניסיונות תשלום, המתינו דקה
```

On scan (supplier):

```
יותר מדי סריקות. המתינו דקה ונסו שוב.
```

Do not say "חשד להונאה" to a legitimate cashier on the first rate limit.

Design lockout in security §9.3 (5 consecutive / 10 in 5 min / 25 in 1h) is **not** confirmed shipped. Do not treat it as live until the RPC matches.

---

## 2. Device fingerprint

Live: **referral only**. Table `referral_signals` (migration 098). Kinds `device` | `ip` | `card`. SHA-256 of `kind:value`. RLS deny-all. Guest cookie used as device id on referral claim.

Not live: browser fingerprinting for analytics (forbidden in analytics docs). `push_tokens.device_id` is not a fraud FP.

PLANNED checkout fingerprint (hashed, not raw):

| Signal | Store | Use |
|---|---|---|
| IP (first `x-forwarded-for`, know it is forgeable without Vercel overwrite) | hash | velocity + chargeback pack |
| Guest `ke_session_id` | hash | multi-account |
| Saved-card token id (not PAN) | token uuid | self-referral, multi-account |
| Phone E.164 | hash | same |

TTL: hashes 180 days, then delete (privacy / Amendment 13). Do not keep raw IP forever in the app DB (ip sweep on short tables; see privacy on other branches).

Hebrew: no customer-facing "we fingerprint you" banner beyond cookie policy. Legal text lives in privacy, not in checkout.

---

## 3. Chargeback workflow

Ops, not an autonomous job. Playbook: `docs/CUSTOMER-SUPPORT-PLAYBOOK.md` §19, support architecture §2.5.

1. Cardcom notice → SEV ticket. No PAN in the ticket.
2. Suspend open vouchers on the order (`suspended`). Stop payout eligibility (T+3 already a guard).
3. Evidence pack: order id, `paid_at`, webhook journal, voucher status, scan log, email proof of voucher issued. GetLpResult amount.
4. If **redeemed**: defend with redeem time and supplier. Do not also refund on-site unless losing the case.
5. If **unredeemed**: prefer accept when ops cost > amount; cancel voucher either way.
6. Outcome: `won` / `lost` / `accepted`. Ledger enum includes `chargeback`.
7. Lost + redeemed: `agent_flags` on the account. Owners + payments SEV.

Hebrew to customer (only after a human writes the outcome):

Won:

```
המחלוקת מול חברת האשראי נסגרה. הקופון נשאר בתוקף לפי הסטטוס בחשבון.
```

Lost, unredeemed:

```
החיוב בוטל על ידי המנפיק. הקופון בוטל. אם שילמתם יתרה בבית העסק, זה מול בית העסק.
```

Lost, redeemed:

```
החיוב בוטל אחרי מימוש. פתחנו בדיקה. אל תנסו לסרוק שוב.
```

Never promise "נזכה מיד". Never tell them to pay again.

---

## 4. Refund abuse

Threshold: 3+ refund **requests** / user / 30 days (Asia/Jerusalem), or unpaid `cashback_reversal_debts`.

Actions (human):

| Step | Action |
|---|---|
| 1 | yellow flag on `/admin/users/[id]` |
| 2 | cashback credits paused |
| 3 | new coupons still issuable unless owners freeze checkout for that profile (PLANNED flag; **not** a live column today) |
| 4 | defect claims (`isDefectClaim`) do not count toward the 3 |

Hebrew when a 4th request is refused pending review:

```
קיבלנו כמה בקשות ביטול בחשבון הזה. נבדוק ידנית. לא נבטל אוטומטית.
```

Same-day cancel and legal 14-day remote sale still apply. This flag does not void Consumer Protection Law. It queues a human.

Fee: min(5%, ₪100) as today, 0 on defect. Abuse review is not an extra fee.

---

## 5. Blocklist

There is **no** `ip_blocklist` or `blocked_users` table in HEAD. Do not pretend otherwise.

| Existing | Role |
|---|---|
| `rate_limits` / `user_rate_limits` | counters |
| `security_events` | log |
| `referral_signals` | hashed signals |
| `agent_flags` | review queue |
| `channel_suppressions` | email/SMS/WA bounce, complaint, STOP |
| supplier/affiliate `suspended` | ops |

PLANNED `risk_blocks`:

| column | meaning |
|---|---|
| `subject_type` | `profile` / `phone_hash` / `ip_hash` / `card_token_id` |
| `subject_hash` | sha256 |
| `reason` | `chargeback_lost` / `refund_abuse` / `manual` / `scan_fraud` |
| `action` | `deny_checkout` / `deny_cashback` / `deny_referral` / `review_only` |
| `created_by` | admin id |
| `expires_at` | optional |

Checkout consults `deny_checkout` **fail-closed** (if the table is unreachable, treat as deny only when `CHECKOUT_ENABLED` is already off; otherwise do not take the whole site down on a missing table). Spec: missing table = no extra deny (ship is additive).

Hebrew when profile is denied checkout:

```
לא ניתן להשלים תשלום בחשבון הזה. פנו לתמיכה עם מספר לקוח, בלי מספר כרטיס.
```

IP hash blocks are a last resort (NAT). Prefer profile and token id.

---

## 6. Acceptance

- Velocity table is the live contract; DB 30/min scan and app 120/h redeem both exist, document both.
- Fingerprints hashed, referral live, checkout hashes planned.
- Chargeback: suspend voucher, evidence pack, no double refund.
- Refund abuse at 3/30 days is review, not a law override.
- No invented IP deny table in code until `risk_blocks` ships.
