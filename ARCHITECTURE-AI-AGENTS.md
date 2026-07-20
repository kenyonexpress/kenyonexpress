# ארכיטקטורת שכבת סוכני ה-AI (AI Agents Layer)

מסמך תכנון מלא לדומיין סוכני ה-AI. תכנון בלבד, אפס קוד ואפס מיגרציות.
תאריך: 2026-07-20. ענף: `phase5/homepage`. מיקום מחייב לפי המשימה:
שורש הפרויקט.

מקורות שנקראו: `docs/ARCHITECTURE-AI-AGENTS.md` (V1, סכימת 028),
`docs/ARCHITECTURE-AI-AGENTS-RUNTIME.md` (V2, runtime + 6 סוכנים),
`supabase/migrations/028_agents.sql` (הסכימה החיה המתוכננת),
`docs/MASTER-ARCHITECTURE.md` (v3), `docs/ARCHITECTURE-SECURITY.md` (035, גובר באבטחה),
`docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` (037, גובר בדין),
`docs/ARCHITECTURE-COMMERCE.md` (026), `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027),
`docs/ARCHITECTURE-ANALYTICS-BI.md` (033/034), `docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031),
`docs/ARCHITECTURE-ACCOUNT-IDENTITY.md` (029), `docs/ARCHITECTURE-API-CONTRACTS.md`,
`src/db/schema/commerce.ts`, מיגרציות 001-042.

---

## 0. מעמד המסמך והיררכיית סמכות

מסמך זה הוא התכנון המאוחד של חמשת הסוכנים שהמשימה מגדירה, מנקודת מבט מוצר +
ארכיטקטורה + דין. הוא נשען על התשתית שכבר תוכננה ואינו פותח אותה מחדש:

1. `supabase/migrations/028_agents.sql` הוא מקור הסכימה והאינווריאנטים של התשתית
   המשותפת (prompt versioning, run logging, תורי אישור). המסמך הזה לא משכתב אותו.
2. `docs/ARCHITECTURE-AI-AGENTS-RUNTIME.md` (V2) הוא ההכרעה המחייבת של ה-runtime
   (SDK, מודלים, תקציבים, evals, סדר השקה). המסמך הזה גובר עליו רק בשני מקומות
   שהמשימה מוסיפה בהם דרישה חדשה: (א) טבלת יומן שיחה מפורש לסוכן התמיכה
   (סעיף 4.4); (ב) תת-מערכת גרידת מתחרים לסוכן התמחור (סעיף 8). בכל השאר V2 גובר.
3. אבטחה לפי SECURITY (035). דין לפי LEGAL (037). כסף וסכימה לפי MASTER / 026 / 027.

**גבול המשימה מול הקטלוג הקיים**: הקטלוג המלא מונה 6 סוכנים. המשימה הזו מגדירה 5:
תמיכה, onboarding ספקים, תוכן, הונאות, מודיעין תמחור. הסוכן השישי (`shopping`, עוזר
קניות בחנות) קיים בקטלוג ומחוץ לתחום המשימה הזו; הוא מוזכר כאן רק בטבלת הקטלוג
ובמודל העלות כדי לא לפצל את מקור האמת.

**מיפוי שמות המשימה לשמות ה-`agent_key` הקנוניים**:

| שם במשימה | agent_key קנוני | מצב בקטלוג |
|---|---|---|
| Customer Support Agent | `support` | קיים (028), מועמק כאן |
| Supplier Onboarding Agent | `supplier_ops` (מצב onboarding) | קיים (028), מועמק כאן |
| Content Agent | `catalog_enrichment` | מתוכנן (V2, טבלאות ב-039) |
| Fraud / Anomaly Agent | `fraud_watch` | קיים (028), מועמק כאן |
| Pricing Intelligence Agent | `pricing_analyst` | מתוכנן (V2), מורחב כאן עם גרידת מתחרים |

---

## 1. עקרונות על (חמישה אינווריאנטים שלא נפתחים)

1. **הסוכן הוא תשתית פנימית, לא קסם.** כל סוכן הוא לולאת tool-use של Anthropic API
   בתוך תהליך Next.js שלנו (route handler או server action). אין Managed Agents ואין
   ריצה בענן של צד שלישי, כי זהות ה-RLS של המשתמש חיה רק בתוך ה-request שלנו.
2. **Grounding בלבד.** המודל לעולם אינו מקור אמת למחיר, מלאי, סטטוס הזמנה, יתרת ארנק
   או תוקף קופון. כל עובדה מגיעה מכלי שמחזיר שורות חיות מ-Supabase. תשובה בלי תוצאת
   כלי = "לא נמצא", לא ניחוש.
3. **RLS הוא גבול ההרשאה, לא ה-prompt.** כלי בהקשר משתמש מחובר רץ עם ה-client שלו
   (anon key + session cookie) וכפוף ל-RLS; הוא פיזית לא יכול לקרוא נתוני משתמש אחר.
   `service_role` רק בסוכנים ללא פני-לקוח (תוכן, הונאות, תמחור) ותמיד קריאה בלבד או
   כתיבה לטבלאות הסוכנים בלבד.
4. **אף סוכן לא כותב כסף ולא מפרסם.** אין כלי שמבצע refund, משנה `platform_percent`,
   מסמן קופון, נוגע בארנק, או מפרסם מוצר. כל תוצר סוכן נכנס לתור אישור אנושי
   (`agent_escalations`, `listing_drafts`, `agent_flags`, `enrichment_suggestions`,
   `agent_reports`). ההחלה הכספית/הפרסום נשארת פעולת אדם דרך המסלולים הקיימים.
5. **הכול נמדד וניתן לשחזור.** כל ריצה ב-`agent_runs` (טוקנים, עלות, כלים, תוצאה); כל
   קריאת כלי ב-`agent_run_steps` (append-only, PII ממוסך); כל שינוי מצב מוזרם ל-`audit_log`
   דרך ה-trigger של 025. כל ריצה מצביעה לגרסת ה-prompt המדויקת ששימשה אותה.

---

## 2. ארכיטקטורת ה-runtime המשותפת

### 2.1 מנוע ההרצה

- **SDK**: Anthropic TypeScript SDK (`@anthropic-ai/sdk`) ישירות. הלולאה דרך
  `client.beta.messages.toolRunner` עם `betaZodTool` (חיתוך אחרי N צעדים, יירוט תוצאות
  כלים לפני החזרה למודל, streaming). לא לולאה ידנית ולא Claude Agent SDK (הוא מביא כלי
  filesystem/bash מיותרים ומסוכנים).
- **בידוד קשיח**: כל קריאות Anthropic מרוכזות במודול יחיד, `src/server/agents/` (runtime
  משותף + קובץ פר סוכן). אף קריאת מודל מחוץ למודול הזה.
- **המפתח**: `ANTHROPIC_API_KEY` הוא env של שרת בלבד, לעולם לא עם קידומת `NEXT_PUBLIC_`,
  לעולם לא נשלח ללקוח, נטען דרך `env.ts` עם ולידציית zod fail-fast. רשום בטבלת הסודות
  של מסמך האבטחה. אין מפתח פר-סוכן; ההפרדה היא לוגית (agent_key) לא קריפטוגרפית.

### 2.2 מודל, effort, מגבלות פר סוכן

הערכים נשמרים ב-`agent_prompts` (עמודות קיימות ב-028) ונקראים בזמן ריצה. שינוי = גרסת
prompt חדשה, לעולם לא UPDATE של תוכן קיים.

| agent_key | מודל | effort | max_output_tokens | max_tool_steps | transport |
|---|---|---|---|---|---|
| `support` | `claude-opus-4-8` | medium | 2048 | 6 | route handler + SSE |
| `supplier_ops` | `claude-opus-4-8` (vision) | high | 4096 | 10 | server action |
| `catalog_enrichment` | `claude-opus-4-8` (בהשקה) | medium | 3000 | 0 (אין כלים) | Batch API דרך cron |
| `fraud_watch` | `claude-opus-4-8` | high | 4096 | 0 | cron route |
| `pricing_analyst` | `claude-opus-4-8` | high | 8000 | 0 | cron route |
| `shopping` (מחוץ לסקופ) | `claude-opus-4-8` | low | 2048 | 6 | route handler + SSE |

פרמטרים אחידים בכל קריאה: `thinking: {type: "adaptive"}` מפורש (על Opus 4.8 ברירת המחדל
בלי thinking); בלי `temperature`/`top_p` (נדחים ב-400 על Opus 4.8); `strict: true` על כל
כלי; `output_config.format` עם json_schema (נגזר מ-Zod דרך `zodOutputFormat`) בכל פלט
שנכנס ל-DB.

### 2.3 Transport ו-streaming

- **SSE (`support`)**: route handler `POST /api/agents/support`, `force-dynamic`, session
  חובה (guard בתוך ה-handler, `UNAUTHENTICATED` בלי session). הצ'אנקים ללקוח הם טקסט
  התשובה בלבד; קריאות כלים לעולם לא משודרות ללקוח.
- **סינכרוני (`supplier_ops`)**: התוצר הוא טיוטה מובנית, אין ערך ל-streaming ללקוח. בתוך
  השרת `client.beta.messages.stream` + `finalMessage()` כדי לא להיתקע על timeout.
- **Batch (`catalog_enrichment`)**: `client.messages.batches.create`, `custom_id` בצורת
  `enrich:<product_id>:<content_hash>`. cron אוסף תוצאות לפי `custom_id`, לעולם לא לפי סדר.
- **קריאה בודדת (`fraud_watch`, `pricing_analyst`)**: `messages.create` אחת עם כל הקלט,
  ללא לולאת כלים (ארכיטקטורה דו-שלבית: SQL מחשב, LLM מסכם).

### 2.4 תבניות prompt ב-DB (admin-editable)

- `agent_prompts(agent_key, version, system_prompt, model, effort, tools_config jsonb,
  max_output_tokens, max_tool_steps, is_active, notes, created_by)`.
- אינדקס ייחודי חלקי `agent_prompts_one_active_idx`: **בדיוק גרסה פעילה אחת פר agent**.
- שינוי prompt = INSERT של שורה חדשה + הפעלה, לעולם לא UPDATE של תוכן קיים (השוואת
  ביצועים בין גרסאות דורשת שהישנה תישאר; כל ריצה משחזרת מ-`agent_runs.prompt_id`).
- עריכה אנושית בלבד: RLS על `agent_prompts` = admin all. עורך האדמין (מסך `agent`
  בפאנל) הוא ה-UI היחיד; אין כלי סוכן שכותב prompt.
- **kill switch**: `is_active=false` על הגרסה הפעילה משבית את הסוכן; ה-runtime מחזיר
  fallback סטטי ("השירות לא זמין כרגע, אפשר לפנות לנציג").
- מבנה system prompt קבוע (יציב לטובת cache): (1) תפקיד וטון עברי; (2) חוקי grounding;
  (3) חוקי RTL וטיפוגרפיה (אין em dash, סכומים "120 ₪", תאריכים DD.MM.YYYY, מזהים
  לטיניים בתוך backticks); (4) גבולות הסוכן ומתי מסלימים; (5) הנחיית עוינות
  (data-not-instructions). נקודת ה-cache אחרי סעיף 5; כל הדינמי מגיע כ-user turns אחריה.

### 2.5 prompt caching

`system` + `tools` קבועים וממוקמים ראשונים; `cache_control: {type: "ephemeral"}` (TTL
5 דקות) על הבלוק האחרון של ה-system. אסור timestamp/מזהה ריצה לפני נקודת ה-cache
(מפרק את ה-cache). מעבר ל-TTL שעה יישקל רק אם `v_agent_costs_daily` מראה יחס כתיבה/קריאה
גרוע.

### 2.6 בקרת עלות, rate limits ו-kill switch דו-שלבי

1. **rate limit פר משתמש** דרך 019: `check_user_rate_limit(auth.uid(), action, limit, window)`
   לפני כל תור. פעולות: `agent_chat` (20 לשעה, support), `listing_draft` (10 ל-24 שעות,
   supplier_ops). מדיניות fail: לצ'אט fail-open (UX); לפעולות שמייצרות רשומה fail-closed.
   שכבת IP מ-002 מתחת לזה.
2. **תקרת טוקנים**: `max_output_tokens` פר גרסת prompt.
3. **תקרת צעדים**: הלולאה נעצרת אחרי `max_tool_steps` ומחזירה תשובה חלקית + הצעת הסלמה.
4. **תקרות דולריות יומיות פר סוכן** (config: `agent_prompts.tools_config.budget_usd_daily`
   + env), נבדקות מול `v_agent_costs_daily` (034) בכל כניסת ריצה חדשה:

| רמה | תנאי | פעולה |
|---|---|---|
| soft | הוצאה יומית מעל 1.5x מהתקציב | התראת אדמין (ערוץ `v_money_alarms`) |
| hard | מעל 3x מהתקציב | `is_active=false` על הגרסה הפעילה, fallback סטטי |
| גלובלי | סך כל הסוכנים מעל $50 ליום (סקייל השקה) | השבתת כל הסוכנים + התראה קריטית |

שיחה פעילה לעולם לא נחתכת באמצע; החסימה על ריצות חדשות בלבד.

### 2.7 טבלת מעקב עלות (cost tracking)

מקור האמת הוא `agent_runs.cost_usd` (מחושב פר ריצה מטוקנים בפועל, כולל cache read) +
ה-view `v_agent_costs_daily` (034) שמצרף פר `(agent_key, il_date)`. אין טבלת עלות נפרדת
בכוונה: העלות היא נגזרת של הריצות, וטבלה שנייה תיצור drift. התקציב היומי הוא config
(סעיף 2.6), לא נתון. דשבורד האדמין מציג עלות יומית פר סוכן מול התקציב, מגמת 30 יום, ואת
`fn_agent_kpi_snapshot()` (034) ל-KPI העסקיים.

### 2.8 observability ו-audit

- כל ריצה: `agent_runs` (סטטוס `running`/`succeeded`/`failed`/`escalated`/`rejected`,
  טוקנים כולל cache read, עלות, משך, שגיאה) דרך `fn_log_agent_run` (SECURITY DEFINER,
  נעול ל-service_role).
- כל קריאת כלי: `agent_run_steps` (append-only) עם `input_redacted` (מיסוך regex: קודי
  קופון, טלפונים, מספרי חשבון בנק, ת.ז) ופלט מסוכם.
- audit triggers של 025 על `agent_prompts`/`agent_flags`/`listing_drafts`/`agent_escalations`
  (028), ובעתיד על `enrichment_suggestions`/`agent_reports`/`support_conversations`
  /`competitor_price_observations` (039 + טבלאות המשימה הזו).
- שרשרת מלאה ניתנת לשחזור: `prompt version -> run -> steps -> suggestion/flag/report ->
  approval -> audit_log` (ה-actor ב-audit_log הוא האדם המאשר).

### 2.9 eval harness

מקרים ב-`evals/agents/<agent_key>/*.json` עם fixtures מוקפאים; runner node שמריץ מול
גרסת prompt מועמדת; שופט = בדיקות דטרמיניסטיות + LLM-as-judge עם rubric; תוצאות = artifact
ב-git עם `prompt_version`. בדיקות דטרמיניסטיות גלובליות: הפלט בעברית; אין תו em dash; אין
מספר (מחיר/יתרה/כמות) שלא הופיע בפלט כלי או בקלט; אין קוד קופון בפלט; JSON עובר סכימה.
שערי כניסה ירוקים הם תנאי להפעלת גרסת prompt חדשה (CI).

---

## 3. גבולות דאטה, PII ואבטחה (חוצה-סוכן)

### 3.1 מטריצת הרשאות (רשימה סגורה; כל היתר אסור)

| סוכן | client | קריאה מותרת | כתיבה מותרת |
|---|---|---|---|
| `support` | user client (session) | orders, order_items, coupon_codes, wallet של המשתמש (RLS owner) | insert ל-`agent_escalations` + `support_messages` דרך definer |
| `supplier_ops` | user client | קטגוריות ציבוריות, `category_benchmark` (אגרגציה) | insert/update ל-`listing_drafts` דרך RLS |
| `catalog_enrichment` | service role, קריאה בלבד | products + variants + images + categories + שם/עיר ספק | insert ל-`enrichment_suggestions` דרך definer |
| `fraud_watch` | service role, קריאה בלבד | `commission_ledger`, `wallet_transactions`, `coupon_scan_events`, `agent_escalations`, `payments` | insert ל-`agent_flags` דרך definer |
| `pricing_analyst` | service role, קריאה בלבד | views 033/034, `products`, `competitor_price_observations` | insert ל-`agent_reports` דרך definer |
| כולם | service role | (לוגינג) | `fn_log_agent_run` בלבד |

חוקים קשיחים:
- אין כלי שמקבל `user_id` או `supplier_id` כפרמטר זהות. הזהות מה-session בלבד.
- אין `EXECUTE` ל-`authenticated` על אף definer חדש (תבנית 035/1.42: REVOKE מלא +
  GRANT מדויק לפי הצורך).
- `service_role` לעולם לא בתוך כלי של סוכן פני-לקוח (`support`, `supplier_ops`).
- כל שאילתת כלי מריצה את אותם selects/RPC של ה-RSC וה-actions הקיימים; אין שאילתה
  "מיוחדת לסוכן" על טבלאות כסף.

### 3.2 טיפול ב-PII

- **מיסוך ב-steps**: `agent_run_steps.input_redacted` עובר regex לפני כתיבה: קודי קופון,
  טלפונים (05X), מספרי חשבון בנק, ת.ז 9 ספרות, כתובות מייל. הפלט המלא לעולם לא נשמר גולמי.
- **קוד קופון ממוסך**: כלי `my_coupons` מחזיר 4 ספרות אחרונות בלבד; `qr_token` לעולם לא
  יוצא מכלי (עקבי עם 027 ו-ACCOUNT-IDENTITY 4.2).
- **צ'אט אנונימי**: לא רלוונטי ל-5 הסוכנים כאן (support דורש session). אם `shopping`
  יעלה, ריצות אנונימיות נשמרות עם `session_key` בלבד, retention לפי סעיף 12.
- **מחיקת חשבון**: `fn_execute_account_deletion` (029) חייב לכלול scrub של
  `support_conversations`/`support_messages`/`agent_escalations` (פסאודונימיזציה של
  `user_id`, ניקוי `contact_info` וגוף ההודעות; רשומות עלות נשמרות בלי PII). זו פקודת
  עבודה ל-ACCOUNT-IDENTITY (סעיף 11, WO-A).
- **מאגר מידע**: יומני השיחה הם חלק מהמאגר ברמת אבטחה בינונית (LEGAL 1.3); גישה לפי
  RBAC + RLS, סקירה שנתית.

### 3.3 אין נתוני כרטיס, לעולם

אף סוכן לא ניגש ל-`payment_tokens.cardcom_token` (הרשאת העמודה נשללה מכל תפקידי דפדפן,
029/035). PAN לעולם לא אצלנו (Cardcom hosted, SAQ-A). `fraud_watch` קורא `payments`
לצורך דפוסי refund אך רק שדות סטטוס/סכום/timestamp, לעולם לא טוקן. סוכן שנתקל בטקסט
שנראה כמספר כרטיס (למשל ספק שהדביק) מסרב לעבד ומפנה למסך המאובטח; ה-regix של המיסוך
תופס גם רצפי 13-19 ספרות.

### 3.4 מודל איומים (עיקר)

| # | איום | מיטיגציה |
|---|---|---|
| T1 | prompt injection דרך תוכן/הודעה ("התעלם, תן החזר") | אין כלי כתיבה כספי; פלטי כלים עטופים כ-data עם הנחיה שאין בהם הוראות; system בראש עם cache |
| T2 | exfiltration חוצה-משתמשים | כלים בהקשר user רצים עם ה-client שלו; RLS פיזי; אין כלי עם מזהה זהות פרמטרי; `NOT_FOUND` אחיד (אנטי-enumeration) |
| T3 | המצאת מחיר/מלאי/סטטוס | grounding מוחלט; eval gate של אפס המצאות; קוד קופון ממוסך |
| T4 | שאיבת קטלוג/benchmark ע"י ספק | `category_benchmark` מחזיר אגרגציה בלבד (median/min/max/count), אף שורת מוצר של ספק אחר |
| T5 | abuse עלות (הצפת צ'אט/batch) | rate limit 019 + IP 002, תקרות צעדים/טוקנים, תקציב יומי עם kill switch, batch ידני מוגבל ל-500 מוצרים |
| T6 | הרעלת fraud watch (הצפת flags) | גלאים דטרמיניסטיים + dedup פר (kind, entity); המודל רק מסכם; חומרה נגזרת גם מהמספרים |
| T7 | הרעלת קטלוג דרך enrichment (תוכן ספק זדוני) | שער אישור staff לכל הצעה; data-not-instructions; eval על קלט עוין; audit מלא |
| T8 | injection דרך תמונות (טקסט בתמונה) | אותה הנחיית data; vision רק ב-supplier_ops/enrichment ששניהם מאחורי שער אנושי |
| T9 | דוח תמחור מדליף נתוני ספק לספק | `agent_reports` RLS אדמין בלבד; אף view ספקי לא בקלט |
| T10 | הרעלה/דיפמציה דרך גרידת מתחרים | facts-only (מחיר + URL), אין העתקת תוכן; אימות מול DOM; שכבת אישור אנושי לפני שינוי מחיר (סעיף 8) |

---

## 4. סוכן 1: תמיכת לקוחות (`support`)

**מטרה**: ווידג'ט צ'אט בעברית RTL שעונה על סטטוס הזמנה, תקלות קופון, יתרת ארנק ובקשות
החזר, אך ורק מהנתונים של המשתמש המאומת (RLS-scoped), עם הסלמה לאדם דרך מייל ויומן שיחה מלא.

### 4.1 Trigger וממשק

- ווידג'ט צ'אט ב-`/account` (ובאזור העזרה). דורש session; ללא session הווידג'ט מציג CTA
  להתחברות או טופס יצירת קשר סטטי.
- RTL מלא: `dir="rtl" lang="he"`, פונט Heebo, בועות מימין, כפתור "דבר עם נציג" קבוע.
- `POST /api/agents/support`, SSE, `force-dynamic`, guard session בתוך ה-handler.
- rate limit `agent_chat` 20 לשעה (fail-open ל-UX).

### 4.2 כלים (כולם עם ה-client של המשתמש; RLS הוא ההרשאה)

| כלי | מקור | פלט |
|---|---|---|
| `my_orders(limit, status?)` | listMyOrders (RLS owner) | סיכומי הזמנות: מספר, תאריך, סטטוס, סכום |
| `order_detail(order_id)` | getOrderDetail (RLS) | פריטים, סטטוס משלוח, tracking אם קיים |
| `my_coupons(status?)` | getMyCoupons (RLS) | קופונים, קוד ממוסך (4 ספרות), סטטוס, תוקף, שם דיל |
| `coupon_status(coupon_id)` | RLS, בלי `qr_token` | סטטוס, תוקף, פרטי עסק |
| `my_wallet` | getWalletBalance (RLS) | יתרה + פירוט פקיעות |
| `open_refund_request(order_item_id, reason)` | definer `fn_agent_open_refund_intake` | שורת `agent_escalations` kind=refund_intake |
| `escalate_to_human(reason)` | definer insert ל-`agent_escalations` | אישור פתיחה + טריגר מייל |

### 4.3 אכיפת חוקי החזר בכלי (בקוד, לא ב-prompt)

`open_refund_request` אוכף בצד השרת (definer, `auth.uid()` בלבד):
1. הפריט שייך למשתמש (RLS מפיל אחרת ל-`NOT_FOUND`).
2. חלון 14 יום (עסקת מכר מרחוק, חוק הגנת הצרכן): פריט פיזי נמדד מ-`delivered_at`
   (fallback ל-`paid_at`); קופון נמדד מ-`paid_at` ורק כשהוא עדיין `issued`. קופון `used`
   = `STATE_INVALID` (מומש כבר בעסק).
3. מחוץ לחלון: `EXPIRED`; הסוכן מסביר שהחלון החוקי עבר ומציע הסלמה כללית בלי הבטחה.
4. הכלי פותח intake בלבד. שום כסף לא זז; ההחזר בפועל = אדמין דרך `refundPayment` עם
   `requireRecentAuth(15)`.

### 4.4 יומן שיחה (conversation log) - טבלאות חדשות

028 מתעד ריצות (`agent_runs`) וצעדי כלים, אך לא את תמליל השיחה מנקודת מבט המשתמש
(תור-תור). המשימה דורשת יומן שיחה מפורש, ולכן נוספות שתי טבלאות (`039_agents_v2.sql`,
פקודת עבודה WO-B):

```
support_conversations
  id, user_id, status (active|escalated|closed),
  first_run_id, last_run_id, escalation_id?, created_at, updated_at, closed_at

support_messages
  id, conversation_id, run_id?, role (user|assistant|system|tool_summary),
  content_he, tokens?, created_at
```

- **RLS**: `support_conversations`/`support_messages` = user reads own (`user_id = auth.uid()`)
  + admin all. כתיבה דרך definer בלבד מתוך ה-runtime (אין insert ישיר מהלקוח).
- **מה נשמר**: הודעת המשתמש, תשובת הסוכן, ותקציר תוצאת כלי (`tool_summary`, בלי PII גולמי,
  בלי `qr_token`, קוד קופון ממוסך). לא נשמרים raw tool inputs (הם ב-`agent_run_steps`
  admin-only).
- **קשר ל-`agent_runs`**: כל תור = ריצה אחת; `support_messages.run_id` מקשר אותם.
  `agent_runs` נשאר יומן העלות/הטלמטריה; `support_messages` הוא התמליל הקריא ללקוח
  ולנציג בהסלמה.
- **retention**: שיחות סגורות עוברות scrub של גוף ההודעות אחרי 12 חודשים; המטא-דאטה
  (ספירת תורים, סטטוס, עלות דרך `agent_runs`) נשאר. מחיקת חשבון עושה scrub מיידי (3.2).

### 4.5 הסלמה לאדם דרך מייל

- `escalate_to_human` ו-`open_refund_request` יוצרים שורת `agent_escalations` (status=open)
  וגם פולטים `notification_event` (031) שמנתב מייל תפעולי ל-inbox התמיכה
  (סאב-דומיין `txn`, לא שיווקי) עם קישור לשיחה בפאנל (`/admin/agents/escalations/[id]`).
- הסלמה אוטומטית: כלי שנכשל פעמיים, בקשה מחוץ לתחום (ייעוץ משפטי/רפואי, מחירי מתחרים,
  תלונה על עסק), או בקשת המשתמש המפורשת. הריצה נרשמת `escalated`, השיחה עוברת ל-`escalated`.
- הסוכן לעולם לא מבטיח מועדי טיפול, פיצוי או תוצאה. הניסוח הקבוע: "הבקשה נפתחה ותטופל
  על ידי נציג".

### 4.6 מדדי הצלחה

deflection rate (אחוז שיחות שנסגרו בלי הסלמה) יעד >= 60% אחרי חודשיים; אפס המצאות
במדגם ה-eval; אפס דליפת נתוני משתמש אחר (בדיקת enumeration ב-CI); זמן תגובה ראשון p95
< 3 שניות (streaming); CSAT דרך דירוג אופציונלי בסוף שיחה.

---

## 5. סוכן 2: onboarding ותפעול ספקים (`supplier_ops`)

**מטרה**: (א) ליווי עסק חדש בהרשמה: הפיכת טקסט חופשי לטופס בקשה תקין, הסבר התהליך,
ולידציה של שדות חובה; (ב) יצירת תיאורי מוצר מתמונות + טקסט עם הצעת `platform_percent`.
**אדמין מאשר לפני פרסום, תמיד.**

### 5.1 Trigger וממשק

- מצב onboarding: `/supplier/apply` (משתמש מחובר, טרם ספק). מצב listing:
  `/supplier/listings/new` (דורש `supplier_member` פעיל, owner/manager).
- server action (סינכרוני; streaming פנימי בלבד). rate limit `listing_draft` 10 ל-24 שעות
  (fail-closed).

### 5.2 כלים

| כלי | הרשאה | הערות |
|---|---|---|
| `validate_application(draft)` | טהור (Zod בלבד, בלי DB) | מריץ `supplierApplicationInput`: ח.פ 9 ספרות, טלפון, מייל; שגיאות מוסברות בעברית |
| `list_categories` | anon client, RLS ציבורי | עץ קטגוריות פעילות |
| `category_benchmark(category_id)` | definer, אגרגציה בלבד | median/min/max/count של `platform_percent`; אף שורת מוצר של ספק אחר |
| `generate_listing_from_media(text, image_urls[])` | vision, service קריאה על התמונות שהספק העלה | פלט structured לסכימת `listing_drafts.draft` |
| `save_listing_draft(draft)` | user client, RLS `listing_drafts` | רק לספק שהמשתמש חבר פעיל בו |

### 5.3 יצירת תיאור מתמונות

- הספק מעלה עד 5 תמונות ל-bucket `supplier-docs` (027); הכלי מקבל URLs ומעביר אותן
  ל-vision (base64/URL). הפלט: `title_he`, `description_he`, `category_id` מוצע,
  `price_ils` מוצע אם הספק נקב, `attributes`, `images_alt_he[]`, ו-`gaps` (מה חסר).
- **grounding**: אסור להמציא מפרט שלא מופיע בטקסט/בתמונה; תכונה חסרה נכנסת ל-`gaps`,
  לא לתיאור. `suggested_platform_percent` תמיד עם ה-benchmark שעליו התבסס + טווח.

### 5.4 מה אין בכוונה

אין כלי שמגיש את הבקשה (ההגשה = לחיצת המשתמש על הטופס שהסוכן מילא, דרך `submitApplication`
הרגיל); אין כלי publish; אין כלי שנוגע בפרטי בנק. ספק שמדביק פרטי בנק בטקסט: הסוכן מסרב,
מפנה למסך הבנק המאובטח, וה-`input_redacted` ממסך את המספרים לפני כתיבה.

### 5.5 שערי אישור ומדדים

בקשת הצטרפות = `approve_supplier_application` (אדמין); טיוטת מוצר = מסך אישור אדמין
(`listing_drafts.status: pending_admin -> approved`) ורק אז נוצר מוצר draft ב-`products`.
מדדים: אחוז בקשות שעברו ולידציה מהניסיון הראשון; זמן onboarding ממוצע; אחוז טיוטות מוצר
שאושרו בלי עריכה משמעותית (יעד >= 50% אחרי חודש).

---

## 6. סוכן 3: תוכן (`catalog_enrichment`)

**מטרה**: יצירה אוטומטית של תיאורי מוצר בעברית, מטא-דאטה SEO, alt-text והצעות קטגוריה
מנתוני המוצר. **אדמין מאשר לפני פרסום.**

### 6.1 Trigger וזרימה

- cron יומי (`/api/cron/agents-enrichment`, `CRON_SECRET`) אוסף מוצרים חדשים/שהשתנו בלי
  העשרה מאושרת, מגיש מנת Batch, ואוסף תוצאות של מנות קודמות. הפעלה ידנית מהאדמין
  (בחירת מוצרים/קטגוריה, מוגבל 500 למנה). אין לולאת כלים: כל ההקשר בקלט.
- הצרכן המרכזי הראשון: backfill של ~2,000 מוצרי WordPress (032) שתיאוריהם דלים ואין
  להם alt-text; זה חוסם SEO parity ל-cutover.

### 6.2 קלט ופלט

- קלט פר מוצר (service role, קריאה בלבד): שורת product + variants + קטגוריה + שם/עיר ספק
  + attributes + עד 4 תמונות.
- פלט structured (json_schema): `description_he`, `seo_title` (עד 60 תווים),
  `seo_description` (עד 155), `images_alt_he[]`, `category_suggestion` (מזהה + confidence),
  `search_synonyms[]`, `quality_flags[]` (למשל "אין מידות במקור", "תמונה לא תואמת שם").
- הפלט נכתב ל-`enrichment_suggestions` (039), **לעולם לא ל-`products`**.

### 6.3 guardrails ושער אישור

אסור להמציא מפרט (בדיקת eval דטרמיניסטית); אסור הבטחות מחיר/משלוח/אחריות; אין keyword
stuffing. staff (`content_uploader`+) מאשר במסך אדמין; אישור מפעיל את `upsertProduct`
הקיים (עם audit, actor = המאשר). `search_synonyms` נכנסים ל-`search_synonyms` (030) רק
דרך מסך האדמין, לא אוטומטית. גם alt-text דורש אישור ב-v1; auto-apply של alt-text בלבד
יישקל אחרי 500 אישורים עם קבלה מעל 95%.

### 6.4 מדדים

אחוז הצעות מאושרות בלי עריכה (יעד >= 70%); כיסוי alt-text ותיאור על הקטלוג (יעד 100%
לפני cutover); שיפור מדדי SEO (impressions/CTR ב-GSC) אחרי backfill; אפס מפרט מומצא במדגם.

---

## 7. סוכן 4: הונאות ואנומליות (`fraud_watch`)

**מטרה**: לסמן דפוסים חשודים ב-`commission_ledger` וב-`wallet_transactions` (וב-scan
events) לתור ביקורת אנושי, עם digest יומי לאדמין. **לעולם לא חוסם, לא מקפיא ולא מבטל דבר
בעצמו.**

### 7.1 ארכיטקטורה דו-שלבית

1. **גלאים דטרמיניסטיים ב-SQL** (service role, קריאה בלבד): כל גלאי מחזיר שורות מועמדות
   + המספרים. הקוד מחליט מה חשוד, לא המודל.
2. **טריאז' LLM אחד**: מקבל את המועמדות (עד 50), מסווג חומרה, מנסח `summary_he` לאדמין,
   מאחד כפילויות, structured לסכימת `agent_flags`. אפס מועמדות => אפס קריאות LLM (עלות
   אפס ביום שקט).

### 7.2 הגלאים (ספים = config, לא בקוד)

| kind | מקור | תנאי סף |
|---|---|---|
| `double_redemption` | `coupon_scan_events` + `coupon_redemptions` | ניסיון מימוש שני על קוד שכבר `used`, או שתי הצלחות באותו חלון |
| `scan_velocity` | `coupon_scan_events` | מעל 30 סריקות/שעה פר סורק, או פי 5 מהממוצע היומי של הספק |
| `wrong_supplier_burst` | `coupon_scan_events` | 5+ `wrong_supplier` מאותו סורק ב-24 שעות |
| `cashback_velocity` | `wallet_transactions` (ledger 026) | צבירה+מימוש cashback מעל 200 ₪ ב-48 שעות; קצב חריג מול הפרופיל |
| `wallet_multi_account` | `wallet_transactions` + profiles | 3+ חשבונות עם אותו טלפון/כתובת שצוברים `referral_bonus` |
| `refund_abuse` | `agent_escalations` + `payments` + `cashback_reversal_debts` | 3+ בקשות החזר מאותו משתמש ב-30 יום, ריכוז החזרים על ספק אחד, או חוב cashback reversal לא מסולק שחוזר |
| `commission_anomaly` | `commission_ledger` | reversal בלי accrual תואם, סכום חורג מ-snapshot, או פער `platform_fee` מול המחושב |

### 7.3 digest, dedup ושער אנושי

- **digest יומי**: הריצה (cron `agents-fraud`, יומי 05:00, `CRON_SECRET`) מסכמת את ה-flags
  החדשים/המעודכנים ושולחת מייל אחד לאדמין (031, txn) עם קישור לתור `/admin/agents/flags`.
- **dedup**: flag פתוח קיים על אותו `(kind, entity_type, entity_id)` לא נוצר שוב; הגלאי
  מעדכן `evidence` עם הריצה האחרונה (אינדקס ייחודי חלקי ב-028).
- **שער אנושי**: אדמין בלבד רואה flags ומסמן `reviewing`/`confirmed`/`dismissed`. אכיפה
  (השעיית ספק, הקפאת ארנק, ביטול cashback) נשארת פעולה אנושית במסלולים הקיימים. ניסוח
  ה-`summary_he` לעולם לא מאשים בוודאות ("דפוס חשוד", לא "גנב").

### 7.4 תלות ומדדים

הגלאים תלויים בסכימת הארנק הסופית (026 double-entry מחליף את 006) ובהחלת 027/026, לכן
הסוכן עולה אחרי 4-6 שבועות של דאטה מימושים/ארנק אמיתי. מדדים: precision של flags (אחוז
confirmed מתוך שנסקרו, יעד >= 40% ב-high severity); זמן זיהוי חציוני מאירוע ל-flag; אפס
false negatives ידועים אחרי חקירה; אפס חסימות אוטומטיות (אינווריאנט).

---

## 8. סוכן 5: מודיעין תמחור (`pricing_analyst`)

**מטרה**: ניטור אתרי קופונים מתחרים (בגבולות חוקיים), הצעות להתאמת `platform_percent`
ומחירי דילים פר קטגוריה, ודוח שבועי לבעלים. **קריאה בלבד; אף המלצה לא מוחלת אוטומטית.**

הסוכן הזה מרחיב את `pricing_analyst` של V2 (שהיה מבוסס דאטה פנימי בלבד) בתת-מערכת חדשה:
גרידת מתחרים. זו התוספת המהותית של המשימה הזו, ולכן היא מפורטת בזהירות משפטית.

### 8.1 שני מקורות, שתי שכבות

הדוח נשען על **שני מקורות נפרדים** שלעולם לא מתערבבים בכתיבה:
1. **דאטה פנימי** (מקור אמת לכסף): views 033/034 (`v_take_rate_monthly`,
   `v_coupon_funnel_monthly`, `v_coupon_expiry_liability`, `v_revenue_daily`,
   `v_supplier_leaderboard_30d`) + אגרגציית מחירים פר קטגוריה מ-`products`.
2. **דאטה מתחרים** (אות שוק בלבד, לא אמת): `competitor_price_observations` (סעיף 8.3).

### 8.2 גבולות חוקיים של הגרידה (מחייב)

הכרעות דין (כפוף ל-LEGAL 037; קניין רוחני = LEGAL 1.4 סעיף 9 בתקנון שלנו אוסר scraping
של האתר שלנו, וההיגיון חל סימטרית עלינו כלפי אחרים):

1. **facts-only**: נאספים אך ורק עובדות לא-מוגנות: שם עסק/דיל, מחיר, קטגוריה, URL,
   timestamp. **אסור** להעתיק תיאורים, תמונות, טקסט שיווקי או כל ביטוי מוגן בזכויות
   יוצרים. מחיר הוא עובדה ואינו מוגן; ליקוט מסחרי של מאגר עשוי להיות מוגן, ולכן לא
   משכפלים מאגר, רק דוגמים נקודתית.
2. **robots.txt**: מכבדים `robots.txt` ו-`X-Robots-Tag` של כל מקור; דף שאסור לזחילה לא
   נזחל. רשימת המקורות המותרים (`competitor_sources`) מאושרת ידנית ע"י אדמין + סקירה
   משפטית פר מקור, לא גילוי אוטומטי.
3. **ToS ו-anti-circumvention**: לא עוקפים login, paywall, CAPTCHA או הגבלת גישה טכנית
   (עקיפה עלולה להפר חוק המחשבים והסכם שימוש). רק תוכן ציבורי נגיש.
4. **קצב ונימוס**: rate limit נוקשה פר מקור (למשל בקשה אחת ל-10 שניות, מקסימום יומי),
   User-Agent מזהה עם כתובת יצירת קשר, backoff על 429/503. אין עומס שעלול להיחשב שיבוש.
5. **ללא PII**: לא נאספים נתוני משתמשים/ביקורות עם שמות; רק נתוני דיל/מחיר.
6. **ריבונות מקור**: הגרידה רצה משרת מבוקר (route cron), לא מהדפדפן של המשתמש; אף פעם
   בשם משתמש.
7. **מדיניות הסרה**: מקור שמבקש הפסקה מוסר מיד מ-`competitor_sources` (kill per-source).

### 8.3 תת-מערכת הגרידה - טבלאות ותהליך חדשים

טבלאות חדשות (`039_agents_v2.sql`, פקודת עבודה WO-C):

```
competitor_sources
  id, name, base_url, robots_checked_at, is_enabled,
  legal_review_note, rate_limit_seconds, added_by, created_at
  -- admin-managed allowlist; אף מקור לא נזחל בלי is_enabled=true

competitor_price_observations
  id, source_id, observed_at, category_hint, deal_title, price_ils,
  source_url, content_hash, match_product_id? (best-effort mapping),
  raw_facts jsonb  -- facts-only: {price, currency, title, url}. אין HTML גולמי, אין תמונות
```

- **מנוע הגרידה** (`/api/cron/pricing-scrape`, `CRON_SECRET`, נפרד מ-cron הדוח): שכבה
  דטרמיניסטית שאינה LLM. `fetch` צד-שרת -> בדיקת robots -> חילוץ עובדות דרך selectors
  מוגדרים פר מקור (לא LLM על HTML גולמי, כדי למנוע injection והעתקת תוכן) -> נירמול
  מחיר -> INSERT ל-`competitor_price_observations` (facts בלבד). `content_hash` למניעת
  כפילויות.
- **מיפוי למוצר** (best-effort, לא כספי): `match_product_id` נקבע בהתאמה מטושטשת רק
  לצורך הצגה בדוח; לעולם לא משנה מחיר ולא נכנס ל-`commission_ledger`.

### 8.4 הדוח (LLM, קריאה אחת)

- cron שבועי (`agents-pricing`, ראשון 06:00 IL, `CRON_SECRET`). שלב SQL מחשב את כל
  המספרים משני המקורות; קריאת LLM אחת מסכמת, מדרגת עד 10 המלצות עם נימוק מספרי, מסמנת
  confidence, structured לסכימת `agent_reports`.
- המלצות אפשריות: דיל תקוע (0 מכירות), take-rate חריג מול benchmark הקטגוריה, פער מחיר
  מול חציון מתחרים, חבות פקיעה, הצעת `platform_percent` פר קטגוריה.
- **guardrails**: כל מספר בדוח חייב להגיע מהקלט (eval judge בודק); דאטת מתחרים מוצגת
  תמיד כ"אות שוק, לא אומת", עם קישור למקור וה-timestamp; אסור לנסח האשמה על ספק ספציפי
  (זה תפקיד fraud_watch).

### 8.5 שער אנושי ומדדים

הדוח נכתב ל-`agent_reports` (RLS אדמין בלבד) ומוצג בדשבורד; שינוי `platform_percent`
או מחיר דיל בפועל = אדמין דרך ה-actions הקיימים (`upsertProduct`/עריכת ספק). מדדים:
אחוז המלצות שאדמין אימץ; שיפור take-rate/מרג'ין אחרי אימוץ; טריות מקורות (אחוז מקורות
עם observation ב-7 הימים האחרונים); אפס הפרות robots/ToS (בדיקת compliance ב-CI + לוג).

---

## 9. שינויי סכימה מסוכמים

| טבלה/אובייקט | מיגרציה | מצב | תפקיד |
|---|---|---|---|
| `agent_prompts`, `agent_runs`, `agent_run_steps`, `agent_flags`, `listing_drafts`, `agent_escalations`, `fn_log_agent_run` | 028 | טיוטה קיימת | תשתית משותפת |
| `agent_key` enum עם 6 ערכים | 028 (עריכה לפני החלה, WO-1 של MASTER) | מתוכנן | הוספת `catalog_enrichment`, `pricing_analyst` ב-CREATE TYPE |
| `enrichment_suggestions`, `agent_reports`, `fn_agent_open_refund_intake` | 039 (חדש) | מתוכנן V2 | תור אישור תוכן, דוחות, intake החזר |
| `support_conversations`, `support_messages` | 039 (WO-B, חדש במסמך זה) | מתוכנן | יומן שיחת תמיכה RLS-scoped |
| `competitor_sources`, `competitor_price_observations` | 039 (WO-C, חדש במסמך זה) | מתוכנן | allowlist מתחרים + observations facts-only |
| audit triggers + RLS + REVOKE מלא על כל definer חדש | 039 | מתוכנן | תבנית 035/1.42 |

הכול idempotent, מוחל דרך Supabase MCP `apply_migration` בלבד (לא `db push`), אחרי 028;
לאחר החלה `generate_typescript_types` ועדכון `src/types/database.ts`.

---

## 10. השקה מדורגת, תלויות ומדדי הצלחה

סדר ההשקה נגזר מ-V2 סעיף 7 (ערך לפני לקוחות, סיכון נמוך קודם):

| # | סוכן | תנאי מקדים | מדד הצלחה עיקרי |
|---|---|---|---|
| 1 | `catalog_enrichment` | 028+039 חלות; staging 032 טעון | 100% כיסוי תיאור/alt-text לפני cutover; >= 70% הצעות מאושרות בלי עריכה |
| 2 | `support` | הזמנות/קופונים אמיתיים (שלבים 3-4); RL פעיל; 4.4 חל | deflection >= 60%; אפס דליפת נתוני משתמש אחר |
| 3 | `supplier_ops` | פורטל ספקים חי (5א); `supplier_members` | >= 50% טיוטות מוצר מאושרות בלי עריכה משמעותית |
| 4 | `fraud_watch` | 4-6 שבועות דאטה מימושים/ארנק; 026 מיושבת | precision >= 40% ב-high severity; אפס חסימה אוטומטית |
| 5 | `pricing_analyst` | 8+ שבועות דאטה מכירות; 034; allowlist מתחרים מאושר משפטית | אחוז אימוץ המלצות; אפס הפרות robots/ToS |

תנאי חוצה לכל שלב: seed של גרסת prompt + eval harness ירוק לפני הפעלה; תקציב יומי מוגדר;
kill switch נבדק. `shopping` (מחוץ לסקופ) יעלה בין 2 ל-3 אם יוחלט, אחרי קטלוג מועשר וחיפוש חי.

---

## 11. פקודות עבודה (לבעלי דומיינים אחרים)

| WO | קובץ (בעלים) | שינוי |
|---|---|---|
| WO-A | `supabase/migrations/029_accounts.sql` + doc ACCOUNT-IDENTITY | הוספת `support_conversations`/`support_messages`/`agent_escalations` ל-scrub של `fn_execute_account_deletion` |
| WO-B | `supabase/migrations/039_agents_v2.sql` (בעלי דומיין הסוכנים) | טבלאות `support_conversations`/`support_messages` + RLS user-owned + definer writers + audit |
| WO-C | `supabase/migrations/039_agents_v2.sql` | `competitor_sources`/`competitor_price_observations` + RLS אדמין + definer + audit |
| WO-D | `src/contracts/agents.ts` (בעלי src/) | סכימות Zod לכל כלי/פלט; ייבוא מהחוזים הקיימים |
| WO-E | `vercel.json` / `src/app/api/cron/` | crons: `agents-enrichment` (יומי 03:00), `agents-fraud` (יומי 05:00), `agents-pricing` (שבועי ראשון 06:00), `pricing-scrape` (יומי, נפרד); כולם `CRON_SECRET` |
| WO-F | `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` | הוספת סעיף גרידת מתחרים (8.2) לרישום הפערים המשפטיים; סקירה עם עו"ד פר מקור |
| WO-G | `docs/MASTER-ARCHITECTURE.md` | רישום הטבלאות החדשות של 039 (support log, competitor) בטבלת המיגרציות |

---

## 12. שאלות פתוחות

1. **retention ליומני שיחה**: הוצע scrub של גוף ההודעות אחרי 12 חודשים ומטא-דאטה לנצח.
   מאושר? האם נדרש ייצוא שיחה למשתמש (זכות עיון, תיקון 13)?
2. **מייל הסלמה**: לאיזו כתובת inbox מנותבות הסלמות התמיכה? מייל בלבד, או גם וואטסאפ
   (031, Meta Cloud API) ליעד תגובה מהיר?
3. **גבול משפטי סופי לגרידה**: המשימה מבקשת "גבולות חוקיים". הכרעות 8.2 הן ברירת מחדל
   שמרנית; נדרש אישור עו"ד פר מקור לפני הפעלת `pricing_analyst` שלב הגרידה. האם בכלל
   רוצים גרידה, או להסתפק בדאטה פנימי + הזנה ידנית של מחירי מתחרים?
4. **מודל enrichment**: ברירת המחדל opus-4-8; מעבר ל-sonnet-5 (Batch, זול יותר) מותנה
   בשער eval. מי מריץ את ה-eval ומתי?
5. **`fraud_watch` על 026**: הגלאים תלויים בסכימת הארנק הסופית (double-entry). ההתנגשות
   026/027 (payout) חייבת להיפתר לפני שהגלאים ניתנים לכתיבה. מיושב ב-MASTER, טרם הוחל.
6. **auto-apply של alt-text**: אחרי 500 אישורים עם קבלה מעל 95%, לאשר auto-apply של
   alt-text בלבד (לא תיאור/SEO)? מוריד עומס staff אך מוותר על שער אנושי לשדה אחד.
7. **דירוג CSAT**: להוסיף דירוג משתמש בסוף שיחת תמיכה? נדרש שדה בטבלת השיחות ו-UI.
8. **הודעת פרטיות בווידג'ט**: יומני שיחה הם מאגר מידע. נדרש טקסט פרטיות קצר בפתיחת
   הצ'אט + קישור למדיניות (LEGAL 3.2).

---

סוף המסמך. תכנון בלבד: לא נכתב קוד, לא נכתבה מיגרציה, לא שונה DB.
