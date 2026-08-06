# GitHub audit: kenyonexpress/kenyonexpress

נמדד 2026-08-06 (UTC) דרך GitHub API מחובר. הזמנים המקומיים לפי ה-commits עצמם.

## 1. Branches ומתי עודכנו

| branch | commit | עודכן | נושא אחרון |
|---|---|---|---|
| main | 3e4c16c | 2026-08-07 05:37 | ci: [62] every push gates, and the repo-wide checks stop being advisory |
| arch/docs-lifecycle | 43fbf52 | 2026-08-07 05:29 | docs(audit): code vs docs gaps across payments, coupons, refund |
| phase5/homepage | b9f7f5e | 2026-08-06 15:52 | docs(state): [54] first part, and exactly what is left of it |
| claude/terminal-cursor-work-2mr2pq | 72a3a53 | 2026-08-06 10:10 | feat(scripts): old-site baseline tool + partial page list |
| arch/docs-queue | 47813ae | 2026-08-03 03:11 | docs(state): record email/Cardcom/QR/a11y/images doc push |
| docs/final-pack | 0157561 | 2026-08-03 01:09 | docs(arch): rewrite notifications (Resend, Edge, RTL, DLQ) |
| feat/supplier-portal | 7cefeee | 2026-08-03 00:29 | docs(state): production build green, ready for Vercel |
| feat/coupon-redemption | 4731043 | 2026-08-02 13:48 | docs(state): record per-branch rebase verification on main tip |
| feat/e2e | 4731043 | 2026-08-02 13:48 | (אותו commit) |
| feat/notifications | 4731043 | 2026-08-02 13:48 | (אותו commit) |
| feat/personal-area | 4731043 | 2026-08-02 13:48 | (אותו commit) |
| feat/seo-performance | 4731043 | 2026-08-02 13:48 | (אותו commit) |
| feat/admin-core | bdb90b9 | 2026-08-02 13:12 | feat(admin): show per-product commission on products list |
| arch/account-area | e44c275 | 2026-08-01 10:43 | chore(worktree): preserve uncommitted work |
| arch/checkout-cardcom-verification | d5351bf | 2026-08-01 10:43 | chore(worktree): preserve uncommitted work |
| feat/checkout-cardcom | be47a62 | 2026-07-27 09:27 | feat(checkout): Cardcom multi-account, payment_events journal |
| cursor/add-supabase-3c830 | 78ff3a0 | 2026-06-22 | (הקו הישן, מוזג דרך PR #1) |

הערה: חמישה ענפי feat יושבים על אותו commit בדיוק (4731043): כנראה placeholders אחרי rebase, מועמדים למחיקה או לעבודה.

## 2. Branch protection על main

לא ניתן לאימות מהסשן הזה (אין endpoint של protection בכלים הזמינים). עדות עקיפה: commits נדחפים ישירות ל-main בלי PR, כלומר או שאין protection או שהוא לא אוכף PR.

GitHub > Settings > Branches: לבדוק אם קיים rule על main. מומלץ מינימום: require PR + require status checks (עכשיו כשיש CI).

## 3. Actions: 5 הריצות האחרונות

Workflow בשם CI (נוסף לאחרונה; 277 ריצות סה"כ בהיסטוריה). חמש האחרונות, כולן על main:

| זמן (UTC) | תוצאה | commit |
|---|---|---|
| 2026-08-06 19:09 | failure | docs(state): [57] the queue closes... |
| 2026-08-06 18:59 | failure | docs(state): [60] closed... |
| 2026-08-06 18:51 | cancelled | docs(state): [59] closed... |
| 2026-08-06 18:10 | failure | docs(state): [58] closed... |
| 2026-08-06 18:03 | cancelled | docs(state): [56] closed... |

שורה תחתונה: ה-CI על main אדום. 3 כשלונות ו-2 ביטולים ברצף. ה-commit האחרון על main ("every push gates") הפך את הבדיקות למחייבות, אז זה חוסם עבודה קדימה עד שמתקנים.

## 4. Dependabot alerts

אין גישה ל-endpoint של Dependabot מהסשן הזה.

GitHub > Security > Dependabot alerts: אם הטאב לא קיים, להפעיל ב-Settings > Advanced Security > Dependabot alerts.

## 5. האם ה-repo פרטי

**לא. kenyonexpress/kenyonexpress הוא PUBLIC.**

זה הממצא הכי חשוב באודיט: כל הקוד, כל מסמכי הארכיטקטורה (כולל ARCHITECTURE-CHECKOUT-PAYMENT, INFRA-AUDIT, מסמכי Cardcom), קבצי STATE עם פירוט תהליכים פנימיים, וכל ההיסטוריה חשופים לכל האינטרנט. בנוסף open issue אחד פתוח.

ה-repo השני, kenyonexpress-web, כן פרטי.

GitHub > Settings > General > Danger Zone > Change visibility > Make private. לעשות את זה לפני שממשיכים לדחוף מסמכי תשלומים וארכיטקטורה.
