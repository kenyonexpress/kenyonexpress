# Vercel cron

<!-- stale-banner:2026-09-01 -->
> ⛔ **‏מיושן החל מ-01.09.2026. המסמך המחייב הוא `docs/CRON-EXTERNAL.md`.**
>
> ‏הנחת היסוד כאן מתה בקומיט `21342fc4`: עשרת התזמונים הוצאו מ-`vercel.json`,
> ‏כי מכסת ה-cron של Vercel היא תכונת תוכנית (‏Hobby: שני jobs, ברזולוציה
> יומית). הצהרה על עשרה לא נכשלה ולא התריעה, והפלטפורמה פשוט הריצה את מה
> שהתוכנית כיסתה והתעלמה מהשאר.
>
> ‏המסמך הזה גם מתאר job **אחד** מתוזמן. יש **עשרה**.
>
> ‏מה שעדיין נכון כאן, וכתוב טוב יותר במסמך המחייב: למה `expire-vouchers` חייב
> כסף ללקוחות, ולמה `CRON_SECRET` לא מוגדר סוגר את המסלול במקום לפתוח אותו.


`vercel.json` exists for one reason: without it **no scheduled job runs at all**,
and the one scheduled job this product has owes customers money.

## What it runs

`/api/cron/expire-vouchers`, nightly at 23:15 UTC (02:15 Israel in summer,
01:15 in winter; Vercel schedules are always UTC).

The route does two things in this order and they are deliberately not merged:

1. `expire_vouchers()` flips `issued` vouchers past `expires_at` to `expired`.
2. `credit_expired_vouchers()` credits the customer's wallet with what they paid
   online for each expired voucher.

Step 2 is the one that matters commercially. **Expiry is not forfeiture (C6):** a
customer who never used their coupon is owed the money they paid for it. Without
this cron that credit is never issued, and the only visible symptom is a wallet
that is quietly short, on an account nobody is watching.

Scan-time safety never depended on this job. `redeem_voucher()` re-checks expiry
inside its atomic UPDATE, so a lapsed voucher is refused at the counter whether
or not the sweep has run. What the job buys is truthful statuses on the
customer's page and the two money legs.

## Authentication

Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set
in the project's environment variables. The route already refuses anything else
with a 401, so **an unset `CRON_SECRET` does not make the endpoint public, it
makes the job fail closed**: every invocation is refused and nothing sweeps.
Setting it is part of stage 1 of GO-LIVE.

## Why daily, and when to make it more frequent

`credit_expired_vouchers()` caps itself at 500 rows per call so a large backlog
drains over consecutive runs instead of in one long transaction. At the current
catalogue size one run a day drains everything with room to spare. If the number
of vouchers expiring in a day ever approaches 500, raise the frequency rather
than the cap: the cap is what keeps one run from holding a long write
transaction on the vouchers table.

Hobby plans are limited to daily cron granularity and two jobs, which is the
other reason this is one daily entry rather than four six-hourly ones.

## Verifying it after a deploy

```
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/expire-vouchers
```

A 200 with `{"ok":true,"expired":N,"credited":M}` is the job working. A 401 means
`CRON_SECRET` differs between your shell and the deployment. A 500 with
`credited: 0` means step 1 committed and step 2 did not, which is safe: the
statuses are correct and the next run picks the credits back up, keyed
`voucher:<id>:expiry_credit` so they can only ever land once.
