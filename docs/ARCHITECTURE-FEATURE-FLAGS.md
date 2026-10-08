# ARCHITECTURE-FEATURE-FLAGS.md

ארכיטקטורת **Feature Flags / Kill Switches** ל-KenyonExpress.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.

---

## 0. עקרונות

1. Flag שמשפיע על כסף חייב default **בטוח** (checkout כבוי אם חסר env מסוכן).
2. שינוי flag ב-prod בלי deploy קוד כשאפשר (env / `app_settings` טבלה).
3. אין flag שמפעיל Escrow / פיצול קופון לספק.
4. כל flag מתועד כאן + ב-Go-Live.

---

## 1. Flags מחייבים

| Key | Default prod | משמעות |
|---|---|---|
| `CHECKOUT_ENABLED` | true רק אחרי P0 | כבוי = beginCheckout מחזיר CHECKOUT_DISABLED |
| `ESCROW_FLOW_ENABLED` | **false / unset** | אסור true; מסלול פסול |
| `NOTIFICATIONS_ENABLED` | true | כבוי = emit בלבד / skip send |
| `WHATSAPP_NOTIFICATIONS_ENABLED` | false עד templates מאושרים | |
| `SEARCH_ENABLED` | true | fallback SQL אם Meili down |
| `WALLET_APPLY_ENABLED` | true | |
| `SUPPLIER_SCAN_ENABLED` | true | |
| `AI_CS_AGENT_ENABLED` | false עד shadow done | |
| `AI_SUPPLIER_AGENT_ENABLED` | false | |
| `MAINTENANCE_MODE` | false | דף תחזוקה ציבורי; admin נשאר |

---

## 2. אחסון

Phase 1: Vercel env + `process.env` בשרת.  
Phase 2 (אופציונלי): טבלת `app_settings(key, value_json, updated_at)` עם RLS admin-only + cache 30s.

אין LaunchDarkly חובה ביום 1.

---

## 3. שימוש בקוד (חוזה)

```ts
function isCheckoutEnabled() {
  return process.env.CHECKOUT_ENABLED !== 'false'
}

function isEscrowFlowEnabled() {
  // Binding: always false in final model. Do not read env to enable.
  return false
}
```

---

## 4. Runbook

| אירוע | פעולה |
|---|---|
| Cardcom down | `CHECKOUT_ENABLED=false` |
| Redeem abuse spike | `SUPPLIER_SCAN_ENABLED=false` + חקירה |
| Bad notification blast | `NOTIFICATIONS_ENABLED=false` |
| Deploy רע | maintenance + revert |

---

## 5. דגלי ניסוי ב-PostHog (‏STEP 66, ‏09.10)

דגלי ה-A/B הם מערכת נפרדת מהמתגים למעלה: הם לא מכבים כלום, הם בוחרים גרסה של ממשק
לביקור, וכל כשל שלהם הוא בקרה. הרישום היחיד הוא ‏`src/lib/analytics/experiments.ts`
(ארבעה דגלים: ‏`checkout_variant`, ‏`home_hero`, ‏`cta_copy`, ‏`checkout_button_color`), והחוזה
המלא, כולל החותמת ‏`$feature/<flag>` והדוח ב-`/admin/experiments`, ב-`docs/ANALYTICS-EVENTS.md`
סעיף ‏9. הפעלה היא יצירת דגל ‏multivariate ב-PostHog עם מפתחות הגרסאות של הרישום;
דגל חסר, כבוי או עם מפתח לא מוכר מרנדר בקרה ולא חותם דבר.

## 6. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Feature flags + kill switches (`arch/docs-queue`) |
| 2026-10-09 | סעיף 5: דגלי ניסוי ‏PostHog (‏STEP 66) |
