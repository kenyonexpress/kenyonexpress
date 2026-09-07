# Runbook: email down (Resend)

1. Pay still paid. Voucher rows exist. Customer has account QR.
2. Cron drain retries 5 then `dead`. Admin requeue `/admin/queues`.
3. `KILL_SWITCH_NOTIFICATIONS` if Resend is looping 429 and drowning.
4. H1: DNS/domain authentication. SPF/DKIM in the human launch list.
5. Do not send voucher codes from a personal Gmail as a "fix" (codes are capabilities; that's a leak).
